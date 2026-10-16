# Agent Tools And Controlled Resources

> Status: as-built. Mobile Agent execution is device-local only.

The system catalog ships device calendar and reminders, iOS health summaries and workouts, location, web search and fetch, image
generation and `image_process`, Agent management (including `avatar_character_save` and
`agent_set_avatar`), `ask_user_question`, `write_file`, `edit_file`, `read_file`, and
the JavaScript capability `run_js`, all using the settled `ToolRef` and `{ value, artifacts }`
contracts. For each turn the
Host resolves that catalog against model tool support, platform, OS permission, app
configuration, and the Agent's capability-group deny-list, then combines it with
globally connected plugins and the Agent's persisted executable remote MCP bindings. Capability groups (web, image, calendar, reminders,
health, location, agents) are enabled per Agent in the editor; the three file tools and `run_js`
belong to every turn on a client that can execute them, and `ask_user_question` to every turn unless the Agent uses automatic approval. An
enabled tool is offered automatically when its remaining gates pass — the model decides from the
request whether to call it.
Office generation, inspection, and editing are not implemented. Sections that a shipped tool still
diverges from carry an **As-built** note.

This document defines how Cherry Mobile exposes application capabilities to Pi. Pi remains the
sole conversation engine and owns the model → tool → result loop. Application services own every
side effect, credential, system permission, managed file, and provider-specific capability.

## Dependency Rule

```text
Mobile Agent Host
    ├─ resolves the shared system capability catalog
    ├─ resolves globally connected plugins and Agent-specific remote MCP bindings
    ├─ creates a Host-owned turn resource ledger
    └─ builds an immutable RuntimeTool[] snapshot
            ↓
        Pi Runtime
            ↓ RuntimeTool.execute()
    application capability adapter
            ├─ Streamable HTTP MCP
            ├─ device capabilities
            ├─ web search and fetch
            ├─ image generation → AiService / @cherrystudio/ai-core / AI SDK
            └─ managed-file write
```

Pi never imports `AiService`, AI SDK, Expo modules, SQLite services, or MCP persistence. A
capability adapter closes over the narrow application service it needs and is exposed to Pi only as
a [`RuntimeTool`](./agent-runtime.md#tools). AI SDK and `@cherrystudio/ai-core` are model-capability
implementations behind those adapters; they never become a second conversation Runtime.

## Tool Catalog And Bindings

The application owns two different representations:

- A durable **tool binding** says which remote MCP source an Agent may use and its approval policy.
- A turn-local **Runtime tool** contains the provider-safe name, description, JSON Schema, approval
  mode, and execution callback Pi can use for one immutable turn.

Every executable tool also has an application-stable identity:

```ts
type ToolRef =
  | { source: 'builtin'; capabilityId: string }
  | { source: 'mcp'; serverId: string; rawToolName: string }
```

`ToolRef` is the approval and audit identity, and the persistence identity for MCP. The
provider-safe function name is a turn-local execution alias derived deterministically from the
stable ref; server display names and generated aliases are never authority. Alias generation
includes the source namespace and a stable digest, rejects collisions within the snapshot, and
never falls back to display-name matching. The Host snapshots a display name separately so
historical UI remains understandable after configuration changes.

Every system capability has a stable `ToolRef` whose `capabilityId` doubles as its provider alias,
which is unambiguous because the catalog is Cherry-owned and collision-free.
`src/shared/data/types/builtInTool.ts` is the single catalog consumed by the Host. Its descriptors
own platform, permission, application-configuration, base approval, capability-group membership,
and auto-approval eligibility. The Agent editor enables or disables capability groups
(`agent.disabled_capabilities`); it cannot change the base policies, and its approval preference
only changes whether effective `ask` calls show an interactive prompt. `generate_image` is never
auto-approval eligible: enabling the image group is not consent to spend provider quota. Health
tools are also ineligible: each call requires explicit consent to share health data with AI.

`web_search` and `web_fetch` additionally require a selected default web search provider. Fresh
installations select hosted Exa MCP for search and Jina Reader for page reading; neither default
requires a user API key.
Calls use only the configured provider. A failed web lookup stops both tools for the current turn,
retains successful content and failure details, and directs the model to answer from existing
content. See [Web Search](../web-search.md) for the request and partial-result policy.
`generate_image` additionally requires a configured drawing model. An OS permission scope
that can still be requested keeps a device tool available as `ask`; execution prompts after
in-app approval, including after a denial when the OS allows another request. Permanently denied,
unavailable, or unreadable permission states remove dependent tools for the turn.
The inference snapshot records the tools that entered the immutable turn. Enabling an Agent
capability changes its preference; it does not itself request OS permission.

The logical binding model is:

```ts
type AgentToolBinding = {
  agentId: string
  source: 'mcp'
  serverId: string
  rawToolName?: string
  enabled: boolean
  approval: 'auto' | 'ask' | 'deny'
}

type AgentToolApprovalMode = 'default' | 'auto'
```

`default` preserves every Runtime tool's resolved `auto` / `ask` / `deny` policy. `auto` promotes
only effective `ask` tools to `auto`; existing `auto` and hard `deny` policies remain unchanged.
This preference lives on the Mobile Agent rather than on an execution target and applies from the
next turn.

Connected plugins are system-wide: permitted tools and their bundled guides are available to every
Agent, independent of legacy plugin bindings or composer mentions. A mention adds message intent.

For remote MCP, omitting `rawToolName` defines the server default and enables discovery subject to the
server-level disabled-tool list; a specific `(serverId, rawToolName)` binding overrides that
default. There is at most one MCP server default per `(agentId, serverId)` and one specific binding
per `(agentId, serverId, rawToolName)`. A deleted server or tool leaves a disabled/dangling binding
for explicit user repair; it never retargets by display name.

The physical SQLite shape and typed Data API are implemented in `agent_tool_binding` and accept
only MCP bindings. MCP server ids intentionally have no foreign key: deleting a server disables its
rows without erasing their stable identity, display snapshot, or approval. Upsert and replace preserve
the row id for a stable identity, reject duplicates atomically, and cannot create authorization for
a missing server unless that exact dangling identity already exists. Bindings belong to Cherry
persistence, the Host resolves them, and Pi must never read them directly.

The data resolver chooses a specific tool row before its server default, then combines that policy
with the current stored Server state and caller-supplied discovery fact. It reports `unbound`,
`binding-disabled`, `server-unavailable`, or `tool-unavailable` instead of silently falling back.
A temporarily undiscovered tool keeps its stored `enabled` value; only its effective result is
unavailable. This resolver returns configuration facts only and does not create or inject a Runtime
tool.

## Snapshot Resolution

Before admitting a turn, the Host resolves tools in this order:

1. Create the turn resource ledger from controlled current-input and transcript managed-file facts.
2. Read the Agent's capability-group deny-list from its definition.
3. Project only system capabilities implemented and available on the current mobile platform.
4. Resolve executable descriptors for globally connected plugins and the current Agent's enabled
   remote MCP bindings, then select plugin guide sections whose tool prerequisites are available.
5. Apply system permission state, model tool-calling support, and application policy.
6. Apply the Agent approval preference to the combined system and MCP catalog (`ask → auto` only in
   automatic mode; `deny` remains denied).
7. Freeze stable refs, provider-safe aliases, callbacks, and effective approval modes into `RuntimeTool[]` for
   the turn.

Configuration changes affect the next turn. Permission and resource checks that can change outside
Cherry are repeated inside `execute()` immediately before the side effect. A missing tool, revoked
permission, deleted file, or disconnected server fails closed; the callback never performs a
fallback action with broader access.

Step 4 does not wait on the network for a server that has already been listed. The MCP runtime
reuses each server's last complete `tools/list` result, kept in memory for the current connection
configuration and in a per-server file under the app cache directory, until that server is
invalidated by an endpoint, header, or grant change, a disable, a delete, or a plugin connect or
disconnect. Plugin connection validation collects the full tool catalog before saving the grant;
after the save, the runtime caches those definitions under the new grant without a second network
discovery. A send arriving during that local cache handoff waits for it through the existing turn
preparation path. The temporary validation client is closed; actual tool calls still use a
grant-bound client and its live routing checks.

There is no timed refresh: a catalog is only worth refreshing when a turn is about to use it. A
remote catalog carries a freshness window, the server's `ttlMs` bounded to between five minutes and
one hour, or five minutes when the server supplies none. A turn that finds the window elapsed still
receives the cached catalog at once and, while the app is in the foreground, starts a background
refresh for the next turn.
A tools-list notification and a call the server rejects as unknown or invalid refresh the same way.
Bundled plugin catalogs do not age; their grant changes invalidate them. Nothing refreshes on a
timer or on return to the foreground, and an elapsed window never delays a call. Modern
subscriptions close in the background and reopen in the foreground. A fresh connection lists tools
before its first call, and settings screens read live. A catalog with partial-discovery warnings
is served immediately and never written to disk. Both partial and failed discoveries back off before a send can trigger another attempt;
partial catalogs refresh in the background after that delay. Consecutive failures start at 30
seconds and double to a five-minute ceiling, resetting only after complete discovery. Settings
screens may still probe the server. The file stores a
fingerprint of the connection configuration rather than its headers. Because the frozen tool is
pinned to the catalog rather than to a live connection, it may execute over a reconnected client for
the same configuration; execution still rereads the stored server row, and a tool absent from the
live listing fails closed.

The snapshot contains the real executable callbacks. Pi cannot execute arbitrary application
functions: every target must still exist in the current authorized catalog.

MCP capabilities and low-frequency Skill installation/adaptation tools register as upstream `deferred`
tools. Upstream `tool_search` ranks names,
descriptions and parameter metadata with BM25, then loads matching real tools for the next model
request through `control.addTools`. The default result limit is eight; the query must be nonempty.
Loaded tools remain available in that Pi conversation, including after compaction. Cherry retains
only a small Unicode tokenization patch so Chinese service and capability names can be searched.

Cherry no longer maintains empty-query browsing, coverage counters, distinct-term ranking tiers,
`tool_describe`, a per-turn inspected-name ledger, or the `tool_call` dispatch/correction wrapper.
Pi owns schema validation and tool exposure. Every direct or nested capability call still resolves
its stable ref through the Host, checks current policy, requests approval when required, admits
verified artifacts, and participates in the turn's budget and failure-group policy. Historical
`tool_call` entries remain readable; reconstructed history uses real provider aliases.

`tool_search` is a model-only meta tool. Code Mode uses upstream `searchTools`, `describeTool`, and
`describeNamespace` against the callable catalog. Tool visibility does not grant execution: upstream
`callers` independently controls model and script access. Application callbacks provide structured
`{ value, artifacts }` to scripts while retaining their model output and display details separately.
For MCP calls, `value.content` contains the bounded model-visible content, including serialized
structured output and managed image references. UI-only metadata never enters this script channel.
Cherry sets Code Mode's declaration `inlineBudget` to 600 estimated tokens. Direct tools already
carry their complete schemas, so the section keeps a small set of signatures and scripts inspect the
rest through the discovery helpers.
The initial prompt retains plugin capability overviews, critical constraints, and shared operation
rules. Complete plugin guides enter trusted system context through read-only `load_workflow`, and a
connection's tools are refused before approval until its guide is present. Loading ends its tool
round; dependent actions are planned only after the next request supplies the complete instructions.
Loaded guides remain for later turns of the Session. Skill readers remain directly exposed and
their full routing descriptions retain the existing catalog budget.

Before every continuation of the model loop, Pi recalculates the complete live context including
the assistant tool request and every tool result. If the next request cannot retain the output and
safety reserves, the Runtime stops with `context_window_exceeded` before contacting the provider.

MCP tools with effective `deny` policy are absent from discovery. The Host still materializes and
freezes the complete executable MCP catalog before the Runtime starts. The inference snapshot
records that real catalog, not Pi's meta catalog tools. Deferred tool discovery reduces model
tool schema and provider tool-count pressure, but does not make MCP discovery or transport lazy.
Configuration changes therefore still affect the next turn only.

Mobile exposes no shell, working directory, dynamic extension loader, or unrestricted filesystem.
Code Mode can call only the authorized application tools; scripts have no direct network, device,
or filesystem access.

## Controlled File Ledger

Mobile has no desktop-style working directory. Every file first enters Cherry managed storage and
receives a [`file_entry`](../data/file-model.md) id. Protocol operations and file tools accept only
that managed id; raw `file://`, `content://`, sandbox, provider, and user-entered paths are transient
import sources, never authority.

The Host creates `TurnResourceLedger` before freezing the built-in catalog. Read tools receive only
its membership view; `generate_image` rejects an `image_id` outside that view and `read_file`
rejects a `file_entry_id` outside it, both before touching the global managed-file service. A
Host-owned catalog wrapper validates and grants every built-in artifact before returning the tool
result to Pi, and Host event projection repeats the grant idempotently. `write_file` needs no read
grant because it only creates entries. `edit_file` is the deliberate exception to ledger-scoped
reads: knowing an active managed `fileEntryId` is sufficient for it to resolve that source anywhere
in the application file library. It never lists or searches the library, accepts no path, and
never returns the source's content, so the exception widens what the model can change but not what
it can see.

The ledger also records which entries this turn produced: its **drafts**. Every grant that arrives
during the turn is a draft, because only tool artifacts are granted after the ledger is frozen.
`edit_file` consults that set to decide between rewriting a draft in place and saving a new version
(see Managed File Write And Edit).

For Version 1, the Host derives the initial ledger grants from:

- managed files attached to the current user input;
- valid managed-file refs already visible in the Session transcript (the read callback still
  revalidates that the entry remains available); and
- files created by earlier tools in the same active turn.

The Host creates a `TurnResourceLedger` containing explicit readable and derivable `fileEntryId`
sets. Its initial grants are frozen from input and transcript facts. During the turn it may grow only
when an application capability successfully imports a new file and the Host-owned wrapper validates
and records that id before the callback resolves. The tool catalog and approval policy remain
immutable; only this ledger grows monotonically.

An MCP payload or model-produced string never joins the ledger merely because it looks like a
`cherry://file/` ref. An MCP result is ordinary remote data unless a separate Cherry importer
validates its bytes, creates a managed entry, and records the new id. The ledger never grants access
to the whole file library or app sandbox. Independently, `edit_file` validates a supplied UUID
against active managed storage because its explicit policy treats knowledge of an id as authority.

## Tool Results And Artifacts

Every callback returns the typed `RuntimeToolResult` defined by
[Agent Runtime](./agent-runtime.md#tools). Remote MCP JSON is always wrapped as its `value`; it is
never shape-matched as a Cherry result envelope. Only an application capability may return managed
artifacts, and it does so after creating and validating each entry and granting it through the turn
ledger.

Cherry-persisted tool details never contain absolute device paths or image base64 payloads.
Explicit image reads carry pixels only in Pi’s model output, not in those details. Ordinary tools
project their typed outer envelope to the model, so an application artifact's bounded managed ref
remains available for a follow-up tool call. MCP results instead carry an explicit bounded
`modelContent` projection: text excludes `_meta` recursively and user-only content; supported images
reference managed files. Structured content that a text block already serializes is sent once. Text
over the 64K-character budget is cut with both sizes stated, and the whole text is retained as a
managed text artifact the model can page through with `read_file`. The MCP importer alone can
create artifacts from bounded image, audio, and embedded binary content; their managed refs follow
the model content so a follow-up call can read them. Remote JSON never becomes an artifact merely
by resembling one. Temporary `modelImages` bytes reach image-capable models but
are removed from canonical results. Older MCP history uses the same metadata-stripping projection.
Each artifact is also projected into a Runtime file part; the Host persists it as an
Agent Protocol file part with `purpose: 'artifact'` so the transcript retains its reference and
display metadata. Artifact file parts are not implicit later model attachments. An MCP result
may explicitly retain an image in `modelContent`; the Host re-resolves that managed artifact for
image-capable models, with a text fallback if it is missing or unsupported. If the managed entry still exists, a user may explicitly attach it again or the model may
read it through a controlled tool; otherwise the reference remains visible as unavailable.

`write_file` returns its status and new `fileEntryId` under `value`, plus the created managed entry
under `artifacts`. `edit_file` additionally returns the source id, replacement count, and a
bounded snippet of the edited region; when it saves a new version it marks that entry as `derived`,
and when it rewrites this turn's draft it returns no artifact because the draft's file part already
exists. `read_file` returns a line or code-point window under `value` and never an artifact. `generate_image` returns `{ id, name }` refs under `value` and
each imported image under `artifacts`; each image is named after its prompt (`readableFilename`),
never after an id. Pi projects those artifacts as `purpose: 'artifact'` file parts, and the Host
persists both the result envelope and the file parts. Device and web capabilities return portable
JSON with no artifacts.

If a capability delegates work to `JobRuntime`, its Runtime tool still waits for a terminal result
or cancellation during Version 1. A route unmount does not cancel it, but process death interrupts
the Agent turn. Background tool continuation and later turn reattachment require a separate
protocol design and are not implied by the durable job ledger; that design must use the
OS-sanctioned continuation mechanisms described in
[Job Runtime](../job-runtime.md#current-boundaries).

## Capability Rules

### Web Search And Fetch

The Host's web guidance targets one search round and, when source text is needed, one page-read
round for ordinary lookups. Independent queries and page reads should run together. Further
research must address a material evidence gap or an explicit request for broader research; the
model should otherwise answer from the available sources and state limitations. Citation ids resolve
within the message that collected them. Sourced follow-ups read relevant known URLs again to obtain
ids for the current turn; they do not reuse earlier turns' citation ids. This is model guidance, not
a separate hard execution limit.

The turn-local web tools reuse identical pending and completed requests, including citation ids.
Search keys normalize whitespace; page reads cache each URL independently, including across
overlapping batches, and reset with the next turn's catalog. A partially successful batch keeps its
successful pages alongside all failed inputs and stops both web tools for the turn. Combining cached
pages still applies the shared page and batch content limits. Failed requests are cached without
retry; cancellation still propagates without becoming a cached failure.

### Streamable HTTP MCP

- Custom remote servers use Streamable HTTP. The official TypeScript client negotiates modern
  `2026-07-28` or legacy protocols automatically; bundled direct-API plugins keep their existing
  adapters. Direct stdio and the separate deprecated HTTP+SSE transport are not exposed.
- `McpRuntimeService` owns clients, live discovery state, connection disposal, credentials, and wire
  errors. Pi receives sanitized tool definitions and callbacks, never MCP configuration secrets.
- Discovery retains every paginated raw tool name and plain JSON Schema. Selected descriptors are
  adapted with deterministic ref-derived aliases, schema revalidation, a 60-second call bound, and
  a 256 KiB JSON result projection. Remote payloads stay under `value`; a separate bounded native
  importer may retain binary results as managed artifacts.
- Tool calls share the server's pooled connection. A failure is classified by what it proves. A
  call that never left the device, an authorization failure, an HTTP client error, and a JSON-RPC
  rejection of the tool or its arguments all mean the tool did not run. After transmission, a
  timeout or transport failure is retryable for a bundled read or a remote tool annotated read-only
  or idempotent, an unconfirmed write for a bundled write, and an unknown outcome otherwise: the
  model retries only when repeating the call is harmless. A wrong remote annotation costs one
  repeated call and never widens approval. No failure replays a tool call.
- A redirect is followed only within the endpoint's origin, or to its HTTPS form, and only when it
  keeps the method, which covers path canonicalization. A redirect to another origin fails with the
  target address so the user can update the connection; headers and tokens never follow it.
- The Host freezes the discovered tools for the turn, including the endpoint URL and the catalog
  generation that produced them. An endpoint edit or invalidation makes an old callback
  unavailable; rediscovery may populate the next snapshot but never silently retargets the active
  catalog, even when the server row keeps the same URL. A transport reconnect for the same
  configuration keeps the frozen callback usable and lists the live catalog before its first call.
- Third-party MCP bindings project to a base per-call `ask` policy. An explicit `deny` remains
  denied, while any legacy binding-level `auto` row is downgraded to `ask`. The Agent's automatic
  approval mode may then promote that effective turn policy to `auto` without rewriting the row.

### Remote Authorization, Content, And Apps

Custom remote connections support headers or browser-based public-client OAuth. The native owner
uses protected-resource and authorization-server discovery, PKCE S256, resource indicators, state
and issuer validation, and endpoint-bound grants. Access and refresh tokens stay in native secure
storage; SQLite keeps only the grant reference and public client ID. Refresh is shared, revocation
wins over a pending refresh, and a rejected token requires authorization again without replaying
an operation. Servers may use a pre-registered public client ID or hosted Client ID Metadata
Document URL; dynamic registration is used only when the server offers it. The app does not publish
a Client ID Metadata Document for every server or replace provider-specific plugin authorization.

The grant reference is validated before persistence and rejects extra fields. OAuth connections
cannot store a manual `Authorization` header. Disabling a connection retains its grant; removing
OAuth authorization clears both the grant reference and client ID and disables the connection.

OAuth metadata, registration, token exchange, and refresh use origin-scoped `HttpClient` routes
through `mcpOAuthFetch`. The shared transport owns query serialization, response bounds, HTTP
timeouts, redirect rejection, and safe transport errors. The native authorization owner retains
the overall operation deadline and grant policy. The initial MCP challenge probe reads only
response headers through streaming fetch, because that endpoint can return a long-lived event
stream; it cancels the body immediately.

Each custom-server catalog discovery lists prompt metadata alongside tools and stores both in the
connection-fingerprinted catalog file, so prompts share the tool catalog's expiry, list-change, and
rejection refreshes. A prompt-listing failure never blocks tools and keeps the last known prompts. A
stored catalog written before prompt discovery refreshes on the next turn. The composer's MCP entry
appears only when the current Agent has an enabled server-level binding to an enabled custom server
with cached prompts. Both the entry and its compact menu read local metadata without connecting or
listing remotely. Selecting a prompt fetches its messages through `prompts/get` on the server's
shared connection, collecting arguments through the existing question bottom sheet when needed,
then inserts the result into the draft. A prompt without arguments shows progress in its menu row;
dismissing the menu abandons it. Required arguments must be answered; optional arguments may be
skipped. The sheet retains answers across navigation and failed submissions, and cancellation
leaves the draft unchanged. There is no separate preview step. The native owner rechecks the Agent
binding and server configuration before resolving a cached prompt. Prompt roles remain quoted user
content.

Tool-returned resource links keep their preview and add content to the user draft only after Add.
Bounded binary content becomes managed attachments; neither discovery nor preview starts an Agent
turn. A link's host-issued `mcpSource` pins the original connection fingerprint, and `resources/read`
sends the URI to that server even when the URI uses HTTPS or is absent from its resource list.
An edited connection cannot reinterpret an old link. Form and URL elicitation need an operation in
flight. A question asked during tool calls belongs to its server, the scope the consent dialog
names: every call in flight on that server pauses its network budget until the user answers, and the
question is withdrawn when none remains. Content reads keep a connection of their own. Both legacy
server requests and modern input-required rounds use the same native consent queue. Discovery cannot
prompt. Cancellation or the ten-minute consent deadline removes the request. Passwords and credentials belong in the
service's browser flow, not in a form.

MCP Apps uses the official `io.modelcontextprotocol/ui` extension and `AppBridge`. Tool visibility
filters the model catalog; a tool's `ui://` resource produces a lazy interactive-view action in its
result card. Opening revalidates the original endpoint/grant fingerprint and Agent binding, reads
`text/html;profile=mcp-app`, and starts a fresh live view. History never executes a tool or restores
an old bridge automatically. Apps can list/call allowed tools and list/read resources on their
originating server. Every App tool call gets explicit consent and repeats availability, binding,
visibility, and schema checks. Duplicate request IDs cannot execute a second write.

The native WebView shell isolates server HTML in an opaque-origin sandbox and restricts network
and resource origins using declared CSP domains. It denies nested frames, custom origins, browser
device permissions, forms, popups, and direct navigation. External HTTPS links and messages require
native confirmation. Messages are staged in the composer; text/structured model-context updates
remain visible and removable until the user's next submission. Theme, locale, dimensions, and
teardown use the Apps protocol. Closing, backgrounding, revocation, or route disposal ends the view.
The inline native shell enforces CSP through meta directives; this is a mobile implementation
constraint, not evidence of complete CSP-header or Apps conformance. iOS/Android WebView behavior,
real OAuth providers, protocol negotiation, and third-party Apps still require acceptance.

### System Calendar

- Calendar adapters own Expo/native API calls and translate platform results into portable JSON.
- Read and mutation tools are separate capabilities so policy can distinguish private-data access
  from side effects.
- iOS add-only calendar authorization is separate from full access. Reading, updating, and deleting
  events require full access; adding can use add-only access. Android uses its calendar permission
  group. The Expo Calendar requester patch persists completed full-access inquiries, so Settings
  offer the initial add-only upgrade and switch to system management after refusal, including
  after an app restart. A system privacy reset clears that inquiry history.
- OS permission is not an approval substitute. The callback checks both current OS permission and
  the Runtime approval decision immediately before access.
- A missing platform API or denied permission returns a normalized unavailable/permission result;
  it never falls back to another calendar account or remote service.
- On Android, creation failures before writing may open the system calendar form with the event
  details. The user chooses the destination calendar and saves. A rejected or timed-out creation
  after writing starts has an unknown outcome and must not be retried or open a second creation form.
- Failed Android updates may open the existing event in the system calendar for manual editing.
  Pending writes must settle before another edit; a timeout returns an unknown outcome without
  opening the event. The system form does not prefill updates or reliably report whether the user
  saved. Its result is `requires_user_action`, never confirmation of a successful mutation.
  These fallbacks retain the tool's existing permission and approval requirements.
- Reminder capabilities are iOS-only and are absent from the Android catalog rather than present and
  always failing.
- A device failure settles as a `{ status: 'error', message, retryable }` value rather than a throw,
  because a thrown error reaches the model only as an opaque failure it cannot act on.
- `DevicePermissions` directly implements `PermissionsModule` and serializes system prompts.
  Tool cancellation reaches the queue, which skips cancelled requests and remaining prompts in a
  batch. The tool stops waiting immediately, while an already-open system sheet retains the queue
  until its native callback settles.

### Health And Fitness

Health is an iOS-only built-in tool group, not a separate page. System permissions own read
authorization; `health_get_summary` and `health_list_workouts` belong to the `health` Agent
capability. Android has no Health Connect bridge, native health module or health entry.
The Agent created during first-run onboarding enables health; manually created Agents start with
it disabled. Existing Agents retain their stored capability preferences without a data migration.
Both tools always require application approval, including in automatic approval mode.
The approval sheet identifies the receiving model service and explains sharing and conversation
retention. It blocks approval if the receiving service cannot be resolved; denial remains available.
The data is for the user's health and fitness management, not medical diagnosis.

`modules/health-access` owns read authorization for eight types and never requests writing,
background delivery or extended history. HealthKit reports whether authorization was requested,
not whether reading was granted. The `requested` status permits a read attempt without claiming
access; missing records remain null rather than becoming zero. Summary tools can use a subset
of available metrics. Native aggregate queries avoid unbounded raw quantity fetches, disable the
library cache, and daily queries stop between days when the turn is cancelled. The dependency
patch removes native logs of health values.

The initial App Store release removed this integration after a Guideline 2.5.1 finding. Restoring
it requires a new native binary and a new submission; store metadata and review notes must describe
the Agent health analysis and how to reach it. See [Health Review](../../guides/health-review.md).

### Image Generation

- The image tool calls an application-owned generation capability that may use `AiService`,
  `@cherrystudio/ai-core`, and AI SDK internally.
- Pi supplies the validated generation request but does not construct provider SDK options or own
  provider credentials, usage accounting, download, persistence, or cleanup.
- Successful output is imported into managed file storage before the tool reports an artifact.
- Cost-bearing or externally submitted generation uses the application-owned base `ask` policy.
  `generate_image` is never auto-approval eligible, so even an Agent in automatic approval mode
  confirms each call; the tool is absent unless the Agent's image group is enabled and a drawing
  model is configured. Its input schema is built from that model's capability block so the model is
  never offered a parameter its provider rejects.

### Image Processing And Avatar Characters

`image_process` (image group, `auto`) runs deterministic pixel work on conversation images:
`resize` onto a transparent square, `remove_background` (floods a flat colour from the border),
`transplant` (copies the areas where an edited copy differs from the original, within a region,
back onto the original) and `measure`. Pixel code is pure (`src/backend/utils/rgbaImage.ts`); Skia
only decodes and encodes. Every operation except `measure` saves one derived PNG and returns its
pixels in `modelImages`, so the model judges the result before continuing.

`avatar_character_save` and `agent_set_avatar` (agents group, `ask`) are thin app shells over
`@cherrystudio/character-avatar`: the package validates layers, derives anchors and draws covers;
the tools move conversation files into the on-device character library and attach a character to
an Agent through the avatar workflow. The bundled `character-studio` Skill, also shipped by the
package, is offered only when these tools and `generate_image` are all present.

### Managed File Write And Edit

`write_file` accepts a display name rather than a path, writes
bounded UTF-8 text (1 MB) as a new entry, and can neither address nor overwrite an existing one. It
refuses content holding NUL, the one character `read_file` treats as binary, so nothing it writes is
unreadable later. The
model receives `{ status, fileEntryId, filename, size }`; a name it can correct returns
`{ status: 'error', message }` rather than throwing, since a thrown error reaches it only as an
opaque failure.

`edit_file` takes `file_entry_id`, non-empty `old_string`, `new_string`, and optional `replace_all`.
It accepts only active, strictly decoded UTF-8 sources no larger than 1 MiB and produces a result no
larger than 1 MiB; a `replace_all` result is bounded before it is built, so a short match with a long
replacement cannot allocate far past the limit. Like `write_file`, it refuses a `new_string` holding
NUL. Matching is exact and case-sensitive: a single edit requires exactly one
non-overlapping match, while `replace_all` changes every non-overlapping match. It preserves a UTF-8
BOM and all untouched bytes represented by the decoded text. It never uses the desktop filesystem
tool's fuzzy matching, empty-search overwrite, or path semantics. The model receives
`{ status, sourceFileEntryId, fileEntryId, filename, size, replacements, snippet, snippetStartLine }`,
where the snippet is the edited region with two lines of context on each side, capped at 1,200
characters, so the model can confirm the change without reading the file back. When those context
lines are longer than the cap — minified HTML, one paragraph per line — the cut keeps the change and
spends the rest of the budget around it, marking each trimmed side with an ellipsis; a snippet that
ended before the change would confirm nothing. `snippetStartLine` is one-based, like `read_file`'s
`start_line`.

Where the edit lands is a product rule, not a storage detail. A turn ends with one artifact per
file however many edits it took, and across turns a file keeps its history as versions:

- **Draft rewrite.** When the source is one of this turn's drafts, the edit rewrites that entry in
  place. The id, name, and media type are unchanged, `fileEntryId` equals `sourceFileEntryId`, and
  no artifact is returned. This is the only content write in the file model and it is legal only
  because nothing outside the active turn can yet reference the draft.
- **New version.** When the source is anything else — an attachment, or an artifact of an earlier
  turn — the source is never changed and the edit is saved as a new `generated` entry with a
  version in its name: `report.html` becomes `report v2.html`, and editing `report v2.html` in a
  later turn produces `report v3.html`. A number already taken by a file the Session can see is
  skipped, so two versions of one source never share a name. The version is carried in the name
  because the name is what both the file library and the model see; there is no lineage column. The
  new entry is a `derived` artifact and immediately becomes a draft of the current turn, so further
  edits in the same turn rewrite it — including edits that name the original source again, which
  continue that version rather than forking a second one.

Both rules assume one writer at a time, and a message's tool calls run in parallel, so `edit_file`
serializes calls that name the same file: each edit reads what the previous one wrote, in the order
the model listed them. Without it two edits of one draft would both read the pre-edit bytes and the
second write would drop the first — harmless while every edit created its own entry, silent data
loss once a draft is rewritten in place. Edits of different files stay concurrent.

`read_file` is ledger-scoped: only attachments, earlier artifacts of the Session, and this turn's
drafts can be read. It shares `readAttachmentContent` with attachment preparation and captures the
same per-turn `file.document_parser.mode`; changing the preference affects the next turn, not a
later tool call in this turn. No parser failure silently switches engines.

For ordinary text, built-in Office text, and native PDF text, `read_file` takes `file_entry_id`
plus optional one-based `start_line` and `limit` (default 500
lines, at most 2,000) and returns
`{ status, fileEntryId, filename, size, startLine, lineCount, totalLines, truncated, text }`. The
window is cut on a line boundary at 100,000 characters, so `startLine + lineCount` is always the
next line to request. A single line larger than the whole budget is the one case that cannot be cut
on a boundary: the head is returned with `lineTruncated: true`, the read reports itself truncated,
and `nextOffset` gives the code-point offset where the rest of the line starts, since asking for a
later line cannot reach it. Text sources share attachment preparation's 5 MiB source ceiling and
strict UTF-8 decoding; NUL is the only control character refused as binary. `edit_file` retains
its separate 1 MiB editing ceiling. Documents use the selected local parser, with a 50 MiB PDF
source ceiling and 20 MiB for other documents, described in [File Model](../data/file-model.md).
`sourceTruncated: true` means the document extractor reached its own page/row/text limit; it is
independent of the pageable window's `truncated` flag. This lets a model continue reading an
attached document or revisit a file it wrote
in an earlier turn, whose content is deliberately not replayed as an attachment.

Zero-based `offset` and `max_characters` (default/maximum 100,000 Unicode code points) read the
full text as a raw code-point window instead of lines, returning `text`, `offset`,
`characterCount`, `totalCharacters`, `nextOffset`, and `complete`. They are how a cut line
continues, and the only paging AnyDoc output accepts: its result is explicitly
`format: 'json-fragment'`. Concatenating
successive `text` windows until `nextOffset` is null recovers the complete original IR JSON, even
through a single very long string or non-BMP characters. Fragments are not complete JSON objects.
Parser/version, original warnings, and asset descriptors accompany each window. Document assets remain `reference-only`; an explicit read of an authorized managed image is a
separate operation.
Mixed line/offset parameters fail explicitly. The original community `fallback` result remains an
error result rather than being replaced by built-in text.

The tool keeps the last document it parsed in the turn, so paging a document parses it once rather
than once per window. A document entry is never rewritten in place — only this turn's UTF-8 drafts
are — so the cache needs no invalidation. Ordinary text is read fresh on every call.

Both tools run without approval because they have no destructive form, and the Host offers them only
to models that support function calling. Handing tools to a model that cannot call them fails the
whole turn. Implementation: `src/backend/ai/agent/tools/`.

### JavaScript Sandbox

The `run_js` capability owns the setting, the approval policy and the transcript identity. Upstream
`codemode` is its only executor: the Runtime registers that tool in the capability's place and runs
each script inside the capability's `execute`, the same boundary where the Host records tool
diagnostics. `run_js` itself is never a model tool. Upstream owns script syntax, tool discovery, `text` and
`image` output, console capture, `store/load`, nested durable tasks and deterministic replay. Mobile
adapts its transport to the existing native QuickJS-NG engine; no WASM runtime is loaded. Upstream
`models.*` is disabled: model-backed capabilities such as `generate_image` retain Cherry's existing
approval, provider selection and usage attribution.

A script receives structured tool results and can combine calls, but every nested call passes the
same capability checks and approval as a direct model call. Parent and child calls share the
sixty-four-call turn budget, including invalid child arguments. Admission happens before child-task
creation and deduplicates resumed calls by their stable IDs; only model rounds count toward twenty
steps. A child call past the budget fails without creating a task; the script receives the error,
keeps running and returns what it gathered, and the next model request is the tool-free final
response. The Code Mode prompt section states this limit. The live parent shows
bounded child-call summaries. The completed parent retains upstream summaries and managed artifacts;
child outputs are not copied into separate model-history messages. Unsafe child execution is not
promised exactly once after a crash.
Confirmed MCP child results have separate display receipts, preserving their App launchers, resource
authority and media in the transcript even when the parent is cancelled or its task documents retire.

Each script has a fresh native VM, a 64 MiB heap and a dedicated 8 MiB thread stack with a 7 MiB
QuickJS stack limit. Across turns the service runs at most two scripts and, in a separate pool, two
bounded computations such as local page extraction; a script parked on a tool or an approval
therefore never blocks the computation that tool needs. Cancellation removes
queued runs and keeps running slots until native cleanup. The bridge also enforces a deterministic
100,000-interrupt-poll compute budget, including periodic polls while draining promise jobs; waiting
for tools consumes none of that budget. Upstream script timeout options still apply. These are
in-process limits, not process isolation.

Replay uses the upstream journal and start seed. Native clock reads are virtual, timezone is UTC,
and WeakRef/FinalizationRegistry are absent. Engine, driver/prelude, platform and budget fingerprints
reject incompatible unfinished replay. The VM transports JSON and invokes only upstream's prelude;
its native message and clock callbacks are not globals available to scripts.

Full output and script images become generated managed files. `managed-file:<id>` paths denote
`read_file`'s `file_entry_id`; they are not device paths. A saved text over `read_file`'s 5 MiB
source limit keeps its start and ends with a note of the cut; the tool result already holds the
output's start and end. Each file has a deterministic replay receipt and receives the same file
authorization checks.
Confirmed nested artifacts also have data-only Pi entries, so they reach Cherry's file message
parts even if the parent is cancelled or interrupted. They do not turn an interrupted tool into
a successful result or add child outputs to model history. A crash between file creation and its
Pi receipt can leave an unreferenced managed file; this is not an exactly-once file transaction.
`store/load` is temporary Pi working data: history rebuilds, Cherry forks and backup/restore may clear
it. Lasting results belong in managed files. No parallel long-term store is maintained.

A client without the native module, or whose native module predates the interactive bridge, offers
no JavaScript capability. Stored `run_js` results from earlier releases remain readable.

`read_file` can explicitly read PNG, JPEG, WebP and GIF within the same conversation file ledger.
It reuses native image normalization and the existing attachment byte limit. Vision-capable model
calls receive bounded pixels; scripts receive metadata. Visible Cherry transcript parts and tool
details omit pixels, but a valid context checkpoint within the 256 KiB limit can retain them.
When rebuilding from transcript alone, read the image again if its pixels are needed. Arbitrary
paths and directory enumeration remain unavailable.

### Skill Boundary

- General Mobile Skills use installed packages, Agent bindings and package-local resource reads.
  Bundled plugin guides remain selected with the Agent's executable MCP tools and projected by the Host;
  see the [plugin guide contract](../../../src/backend/services/builtInMcp/README.md#plugin-guides).
- A Skill supplies instruction context, not a Runtime capability; it cannot add
  tools or change approval, permission, MCP, or managed-resource policy.
- See [Agent Skills](./agent-skills.md) for package acceptance, loading and execution limitations.

## Approval And Failure Policy

Tool configuration, OS permission, turn resource ledger, and per-call approval are independent
gates. All must allow execution. `auto` skips only the interactive approval sheet; it does not
bypass the other gates, expose a missing tool, or broaden application-managed data access. `deny`
is fail-closed and no callback runs.

Every callback receives the turn `AbortSignal`, applies a capability-specific timeout, redacts
credentials and private payloads from errors, and returns portable values. Cancellation propagates
through MCP, provider, device, and file operations where their APIs support it; non-abortable native
work must discard late results after the turn is terminal.

Pi caps each turn at twenty tool-loop steps and sixty-four tool calls. Reaching either budget allows
one final response with all tools disabled, using the current results and disclosing remaining gaps.
This response remains subject to the context limit; the turn itself has no wall-clock deadline. The MCP
adapter separately caps each remote call at 60 seconds and projects at most 256 KiB of JSON. These
limits are application constants rather than user settings in Version 1.

## Desktop Relationship

Cherry Desktop proves the useful semantics: Pi owns its tool loop, MCP tools are adapted into Pi,
tools are disabled and approved by application policy, and skills are injected explicitly. Mobile
ports those semantics but not the Electron/Node execution surface. Desktop workspaces, shell tools,
arbitrary filesystem paths, local MCP processes, and executable Skill trees are explicit mobile
exclusions; a script reaches the app only through the Agent's own tools.
Streamable HTTP MCP and device/application capability adapters are semantic ports.

The PC Agent Controller reuses the normalized application presentation of a tool or
approval, but PC tools remain owned and executed by the PC Agent Runtime. The mobile adapter maps
their opaque identities, lifecycle, approval requests, and resource results into Agent Protocol
values; it does not register them as local `RuntimeTool` callbacks. They are different from a local
Agent's Streamable HTTP MCP tools: the latter remain in the local Host/Pi tool loop, while only their
individual MCP request crosses to a remote endpoint.

Desktop also keeps pending approvals in process memory, emits a terminal denied tool output when the
user refuses a call, finalizes non-terminal tool parts when a stream is interrupted, and omits an
unanswered approval call from reconstructed model history. Mobile preserves those invariants with
its own normalized `denied` and `interrupted` states and typed result envelopes; it does not copy the
desktop event labels or persistence shapes.

## Acceptance

- Every Agent turn receives one immutable, application-resolved tool snapshot.
- Every exposed tool and approval carries a stable built-in or `(serverId, rawToolName)` identity;
  provider aliases and display names are not authority.
- Pi is the only conversation and tool-loop owner; AI SDK is reachable only behind capability
  adapters.
- MCP exposes only configured Streamable HTTP tools without losing other persisted transport data.
- Calendar access requires both OS permission and tool policy.
- Managed-file tools accept no arbitrary paths; only validated application-created outputs can
  extend the turn resource ledger, and file writes and edits never overwrite an existing entry.
- Mobile Skills cannot add tools, approvals, credentials, or resource-ledger grants.
- Cancellation, denial, unavailable tools, and process interruption all fail closed without late
  side effects entering the transcript or non-terminal tool calls entering later model history.


## User Questions

`ask_user_question` is a core system tool, available when the model supports tool calls and the
Agent does not use automatic approval. Choosing automatic approval means the user does not want the
turn to stop for them, so that mode withholds the tool and the model asks for missing decisions in
its reply. One call contains one to eight questions with unique IDs, each with up to four concise
options and single or multiple selection. An empty options array requests free text only. The tool
waits for a user response; it is not a tool-approval request and never auto-selects an answer. A custom
text answer and skipping are always available. Skipping does not authorize an action.

The Host supplies the response channel to the catalog through turn preparation; each call carries
its turn id, so the Host correlates the question to the live turn and tool-call ID. The Protocol
publishes `question.updated` and includes `pendingQuestion` in observation snapshots. While a
question is pending, the turn reports `awaiting-input`. A question sheet opens over the chat and
leaves the ordinary input's draft intact; desktop question forms in remote chat reuse the same sheet
through the shared interaction contract. It shows one question at a time with its full text in the
scrolling body, radio options for a single choice, and checkboxes for multiple. Choosing never
navigates; tapping a selected option clears it so the answer can return to free text only or be
skipped. The footer action reads skip until the question is answered, next once it is, and submit on
the last question, with previous beside it. Choices and free text remain editable until the user
submits the complete set; local submission marks any unanswered question skipped.
Skip never submits or cancels the turn. There is no close control.
Turn cancellation discards the pending request without submitting answers. Approval requests take
presentation priority if tools were called concurrently, without discarding the question draft.
When the source is no longer current, the sheet closes while preserving its draft so navigation and
connection recovery stay reachable; the same request reopens when the source recovers.
A second simultaneous question call is rejected.

Question arguments and successful answers use ordinary persisted tool parts. The transcript shows
a flat read-only record of every question and answer, associated by `questionId`. Missing, duplicate,
unknown, or invalid answers reject the whole response without settling the wait. Pending callbacks and waiting state are memory-only, like
approvals: leaving a route does not cancel the turn, but cancellation, host disposal, and process
restart invalidate the question. Persisted unanswered questions are not resumable controls.

A question waits for its answer like an approval wait; the turn has no deadline to expire meanwhile. Background activity uses the existing approval attention phase
with a question-specific label and releases its keep-alive lease. This does not promise indefinite
background execution or recovery after the operating system terminates the app.


## Agent Management

The `agents` capability group contains `agent_list`, `agent_get`, `agent_create`, and `agent_update`.
The editor lists it as Agent management alongside the other capability groups; it needs no OS
permission. New Agents start with it disabled,
whether created from the editor or by these tools; the seeded default Agent keeps it enabled so a
fresh installation can create Agents from conversation. Reads use automatic approval; writes start at `ask` and follow the current Agent's approval
preference, without a second confirmation flow. These tools do not delete Agents, modify avatars,
or change MCP bindings.

Creation accepts a name, instructions, and optional definition fields. Omitting `model` lets
`AgentService` resolve the global default Agent model; omitted capability settings use the same
disabled groups as the manual create form. A saved Agent without a model remains editable
but cannot start chatting. The model derives instructions from the conversation and may use
`ask_user_question` for material missing requirements.

`agent_list` supports name search and pagination, returns at most 50 compact records per call,
and omits instructions. `agent_get` returns the editable definition, `updatedAt`, and current Skill
bindings (`skillId` and `isEnabled`); both get and
update accept `current` to refer to the originating conversation's Agent. Update requires that
version and an explicit field patch. The persistence transaction compares the row timestamp before
writing, rejecting a concurrent edit or deletion. A conflict requires reading and reconciling the
latest definition. `changes.skills` applies only the listed bindings: `isEnabled: true` binds and
enables, `false` binds and disables, and `null` removes a binding. Unlisted bindings are preserved;
this does not change the Skill library's global enablement. Definition edits and requested binding
changes commit together, so a missing Skill rolls back the whole edit. Changes to the active Agent
apply to future turns only.

Create/update publish committed Data API cache invalidations, including when a turn has no visible
chat subscriber. Successful writes render a compact saved-Agent card with a Start chat action when a model is
configured. List/read results remain in the process disclosure. Results omit managed
avatar paths and credentials. Writes are not automatically replayed: after an uncertain outcome,
inspect current saved records before deciding whether another write is needed.
