# Agent Tools And Controlled Resources

> Status: as-built. Mobile Agent execution is device-local only.

The system catalog ships device calendar and reminders, location, web search and fetch, image
generation, Agent management, `ask_user_question`, `write_file`, `edit_file`, `read_file`, and
`run_js`, all using the settled `ToolRef` and `{ value, artifacts }` contracts. For each turn the
Host resolves that catalog against model tool support, platform, OS permission, app
configuration, and the Agent's capability-group deny-list, then combines it with
globally connected plugins and the Agent's persisted executable remote MCP bindings. Capability groups (web, image, calendar, reminders,
location, agents) are enabled per Agent in the editor; the three file tools and `run_js`
belong to every turn, and `ask_user_question` to every turn unless the Agent uses automatic approval. An
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
auto-approval eligible: enabling the image group is not consent to spend provider quota.

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

Catalog entries carry an expiry: modern servers supply `ttlMs` (capped at one hour), while
legacy and bundled clients use a five-minute fallback. An expired catalog remains a candidate for
the frozen turn while foreground reconciliation refreshes it. Tools-list notifications, a return
to the foreground, and a one-minute foreground timer also schedule reconciliation. Modern
subscriptions close in the background; interrupted legacy event connections reconnect when idle.
Execution lists an expired catalog before calling, and settings screens read live. A catalog with partial-discovery warnings is served immediately and never written to
disk. Both partial and failed discoveries back off before a send can trigger another attempt;
partial catalogs refresh in the background after that delay. Consecutive failures start at 30
seconds and double to a five-minute ceiling, resetting only after complete discovery. Settings
screens may still probe the server. The file stores a
fingerprint of the connection configuration rather than its headers. Because the frozen tool is
pinned to the catalog rather than to a live connection, it may execute over a reconnected client for
the same configuration; execution still rereads the stored server row, and a tool absent from the
live listing fails closed.

The snapshot contains the real executable callbacks. Pi cannot discover and execute an arbitrary
application function by name: every callable target must still exist in the frozen turn catalog.
The Pi binding consumes the Host-prepared application prompt, exposes system capabilities directly,
and translates eligible MCP tools into three catalog tools for the active model loop. When that
catalog is present, Pi also appends its binding-specific catalog workflow guidance to the prompt:

- `tool_search` ranks frozen MCP names and descriptions by the number of distinct query terms a
  tool matches, then by BM25 inside that tier, and returns only the top tier, at most 20 matches
  with bounded TypeScript call signatures. Because the MCP layer prefixes every description with its
  service name, a service-name query browses that service and a domain word narrows it, without
  plugin-specific search rules. Each result leads with `catalogTotal` (the frozen catalog size),
  `matched` (the top-tier count before limits), and `returned` (the count actually included), and
  lists whole query words that matched nothing as `unmatchedTerms`. Unmatched words describe lexical
  coverage, not whether a capability exists. For service overviews, the prompt asks for one initial
  service-name search rather than parallel subdomain searches. `returned === catalogTotal` means
  the whole catalog is in hand; `returned === matched` without truncation means this query is
  complete. A service-name search can still be truncated and require narrower queries. The model
  should not repeat successful searches merely to confirm coverage. The complete serialized model
  result is capped by both a 32,000-character ceiling and the live model-context headroom; a result
  that drops matches reports `truncated: true`.
- `tool_describe` returns one description and signature bounded by the same live headroom.
- `tool_call` resolves an exact name only inside the frozen catalog and re-enters the target
  `RuntimeTool` approval, cancellation, call-limit, artifact, and event boundary before execution.

The Pi binding keeps a per-turn inspected-name ledger. Each tool whose signature was returned by
`tool_search` or `tool_describe` joins that ledger. Calling an uninspected tool does not enter its
approval or execution boundary: the failed meta result returns the bounded signature and records
the name so a corrected retry can proceed. Before dispatch, `tool_call` also validates `params`
against the frozen MCP JSON Schema; a mismatch returns the same bounded signature without invoking
the target, together with bounded field paths and validation reasons. The model receives these
correction details, while failed meta activity retains only the failure code and a short summary.
The message detail sheet translates the correction code rather than displaying the model's signature.

These catalog operations are model-binding mechanics, not application capabilities. `tool_search`
and `tool_describe` emit user-visible message activity with a message-only `meta` ref. Pi receives
the bounded descriptions and signatures, while Runtime output and persistence keep only compact
queries, target names, counts, truncation status, and errors. An invalid `tool_call` target or a
dispatch rejected before execution emits failed meta activity containing only the requested target
name; unresolved parameters are neither persisted nor displayed. Once a target resolves, the
Runtime emits and persists only that target's stable MCP ref, catalog alias, display snapshot,
actual parameters, approval, and result; it does not emit a duplicate `tool_call` wrapper. When
reconstructing Pi history, the Pi message adapter replays meta activity under its own model-loop
name and wraps a persisted MCP target call back into `tool_call({ name, params })`.

Before every continuation of the model loop, Pi recalculates the complete live context including
the assistant tool request and every tool result. If the next request cannot retain the output and
safety reserves, the Runtime stops with `context_window_exceeded` before contacting the provider.

MCP tools with effective `deny` policy are absent from discovery. The Host still materializes and
freezes the complete executable MCP catalog before the Runtime starts. The inference snapshot
records that real catalog, not Pi's meta catalog tools. Deferred tool discovery reduces model
tool schema and provider tool-count pressure, but does not make MCP discovery or transport lazy.
Configuration changes therefore still affect the next turn only.

Mobile does not expose the desktop `tool_exec` JavaScript executor, a shell, workspace, dynamic
extension, or unrestricted filesystem tool. The TypeScript signatures are model guidance only and
are never compiled or executed. `run_js` is not a substitute for `tool_exec`: its sandbox cannot
call tools, MCP, or any application capability.

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

Canonical tool results never contain absolute device paths or inline image bytes. Ordinary tools
project their typed outer envelope to the model. MCP results instead carry an explicit bounded
`modelContent` projection: text excludes `_meta` recursively and user-only content; supported images
reference managed files. The MCP importer alone can create artifacts from bounded image, audio,
and embedded binary content. Remote JSON never becomes an artifact merely by resembling one.
Temporary `modelImages` bytes reach image-capable models but are removed from canonical results.
Older MCP history uses the same metadata-stripping projection. Each artifact is also projected into a Runtime file part; the Host persists it as an
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
  importer may retain binary results as managed artifacts. Unknown remote effects are treated as
  writes for failure classification. Neither authorization failure nor transport failure replays a
  tool call; an uncertain write outcome requires the user to check the service.
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

The composer lists resources, URI templates, and prompts for enabled custom servers. Selecting an
entry reads it through its own server, previews it, and adds it to the user draft only after Add.
Prompt roles remain quoted user content. Bounded binary content becomes managed attachments;
neither listing nor preview starts an Agent turn. Tool-returned resource links use the same preview
flow. Their host-issued `mcpSource` pins the original connection fingerprint, and `resources/read`
sends the URI to that server even when the URI uses HTTPS or is absent from its resource list.
An edited connection cannot reinterpret an old link. Form and URL elicitation belong to one initiating
operation. Both legacy server requests and modern input-required rounds use the same native consent
queue. Discovery cannot prompt. The active network budget pauses during consent; cancellation or
the ten-minute consent deadline removes the request. Passwords and credentials belong in the
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

### Retired Health Capability

The first App Store release omits health access. The executable catalog, Agent capability groups,
permission settings, native dependencies, entitlements, and usage descriptions contain no health
capability. Persisted Agent deny-lists drop the retired `health` id on read using the existing
unknown-capability guard. Existing conversations retain health tool result labels and icons for
historical display; those entries do not register executable tools or request permissions.
Restoring health access requires a separate native feature and App Store submission.

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
later line cannot reach it. Text sources use the same strict UTF-8 decoding and 1 MiB source limit as
`edit_file`; NUL is the only control character refused as binary. Documents use the selected local parser and 20 MiB
source ceiling described in [File Model](../data/file-model.md). `sourceTruncated: true` means the
document extractor reached its own page/row/text limit; it is independent of the pageable window's
`truncated` flag. This lets a model continue reading an attached document or revisit a file it wrote
in an earlier turn, whose content is deliberately not replayed as an attachment.

Zero-based `offset` and `max_characters` (default/maximum 100,000 Unicode code points) read the
full text as a raw code-point window instead of lines, returning `text`, `offset`,
`characterCount`, `totalCharacters`, `nextOffset`, and `complete`. They are how a cut line
continues, and the only paging AnyDoc output accepts: its result is explicitly
`format: 'json-fragment'`. Concatenating
successive `text` windows until `nextOffset` is null recovers the complete original IR JSON, even
through a single very long string or non-BMP characters. Fragments are not complete JSON objects.
Parser/version, original warnings, and asset descriptors accompany each window. Assets are
`reference-only`: no pixel bytes, image artifacts, or multimodal tool-result extension is added.
Mixed line/offset parameters fail explicitly. The original community `fallback` result remains an
error result rather than being replaced by built-in text.

The tool keeps the last document it parsed in the turn, so paging a document parses it once rather
than once per window. A document entry is never rewritten in place — only this turn's UTF-8 drafts
are — so the cache needs no invalidation. Ordinary text is read fresh on every call.

Both tools run without approval because they have no destructive form, and the Host offers them only
to models that support function calling. Handing tools to a model that cannot call them fails the
whole turn. Implementation: `src/backend/ai/agent/tools/`.

### JavaScript Sandbox

`run_js` lets the model compute exactly instead of estimating: arithmetic, statistics, dates,
counting, sorting, parsing, and data transformation. It takes a `code` string, run as the body of an
async function, plus optional `timeout_ms` and `max_output_tokens`, and returns
`{ status: 'ok', result?, logs? }` or `{ status: 'error', kind, message, logs? }`, where `kind` is
`syntax`, `exception`, `timeout`, `memory`, `unsettled`, `cancelled`, or `internal`. The result is
the returned value's JSON; Map and Set become object and array and BigInt becomes a string. The output
budget follows Pi's codemode tool; mobile execution has a bounded deadline and shared concurrency
limit.

Isolation is structural rather than a permission check. [`modules/js-sandbox`](../../../modules/js-sandbox/README.md)
creates a fresh QuickJS runtime for every call, on its own native thread, and destroys it when the
script ends. Its global object holds the standard ECMAScript built-ins, `atob`/`btoa`,
`queueMicrotask`, `performance.now()`, and a captured `console`; there is no `Intl`,
so locale arguments are ignored. Timers, modules, network, files, and every application binding are
absent, and `eval` or `Function` only produce more code inside the same runtime. The tool runs as
`auto` without an Agent capability group and requires only that the model supports function calling
and the client includes the native module; older clients omit the tool. Every call starts fresh;
inputs must be included in the code and results are retained through tool-result messages.

- **Output.** Output within `max_output_tokens` (default 10,000, estimated at four characters per
  token) keeps the structured form above. Longer output becomes one `output` text that keeps its
  start and end around a count of the removed tokens, and the full text — the returned value's JSON,
  then the console output — is saved as a generated `run_js-output.txt` managed file. The result
  carries its `fullOutputFileEntryId`, and the file is granted to the turn so `read_file` can page
  through it. The native side captures at most 500 KiB of each, which keeps a saved output within
  `read_file`'s source limit.
- **Limits.** Execution defaults to 5 seconds; `timeout_ms` can request at most 30 seconds.
  Across all turns, the sandbox service runs at most two scripts concurrently and queues the rest
  in arrival order. Queue waiting does not consume the execution deadline. Cancelling a queued call
  removes it; cancelling a running call releases the caller immediately but holds its slot until
  native cleanup finishes. QuickJS interrupts bytecode and regular expressions, and JavaScript
  cannot catch the interruption. Each runtime's heap is limited to 64 MiB; an allocation past it
  fails inside the script. Native stacks and output copies consume additional memory, and the
  sandbox shares the app process, so these limits do not provide process-level crash isolation.
  Recursion stops with a catchable `RangeError` about 7,000 calls deep.

The Host adds a prompt section asking the model to use the tool for exact computation, to copy the
data it needs into the code because the sandbox cannot read files or tool results itself, and to page
through a saved output instead of rerunning the script.

### Skill Boundary

- General Mobile Skill persistence and binding resolution are not implemented. Bundled plugin
  guides are selected with the current Agent's executable MCP tools and projected by the Host;
  see the [plugin guide contract](../../../src/backend/services/builtInMcp/README.md#plugin-guides).
- The target contract treats a Skill as instruction context, not a Runtime capability; it cannot add
  tools or change approval, permission, MCP, or managed-resource policy.
- See [Agent Skills](./agent-skills.md) for the broader deferred boundary.

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
tool-calling JavaScript execution, arbitrary filesystem paths, local MCP processes, and executable
Skill trees are explicit mobile exclusions; `run_js` computes in isolation and calls nothing.
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
and omits instructions. `agent_get` returns the editable definition and `updatedAt`; both get and
update accept `current` to refer to the originating conversation's Agent. Update requires that
version and an explicit field patch. The persistence transaction compares the row timestamp before
writing, rejecting a concurrent edit or deletion. A conflict requires reading and reconciling the
latest definition. Changes to the active Agent apply to future turns only.

Create/update publish committed Data API cache invalidations, including when a turn has no visible
chat subscriber. Successful writes render a compact saved-Agent card with a Start chat action when a model is
configured. List/read results remain in the process disclosure. Results omit managed
avatar paths and credentials. Writes are not automatically replayed: after an uncertain outcome,
inspect current saved records before deciding whether another write is needed.
