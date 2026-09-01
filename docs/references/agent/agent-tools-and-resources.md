# Agent Tools And Controlled Resources

> Status: as-built. Mobile Agent execution is device-local only.

The system catalog ships device calendar and reminders, health, location, web search and fetch,
image generation, `write_file`, and `edit_file`, all using the settled `ToolRef` and
`{ value, artifacts }`
contracts. For each turn the Host resolves that catalog against model tool support, platform, OS
permission, app configuration, and the Agent's capability-group deny-list, then combines it with
the Agent's persisted executable MCP bindings. Capability groups (web, image, calendar, reminders,
health, location) are enabled per Agent in the editor; both file tools belong to every turn. An
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
    ├─ resolves Agent-specific MCP bindings
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

- A durable **tool binding** says which MCP source an Agent may use and its approval policy.
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

`web_search` and `web_fetch` additionally require their default web search provider to be chosen in
settings. `generate_image` additionally requires a configured drawing model. An OS permission scope
that was never requested does not hide a device tool: it is offered as `ask`, and execution
triggers the one-shot system permission prompt after the user approves the call in-app. A denied or
unavailable scope removes the tool for the turn. The inference snapshot records the tools that
entered the immutable turn.

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

For MCP, omitting `rawToolName` defines the server default and enables discovery subject to the
server-level disabled-tool list; a specific `(serverId, rawToolName)` binding overrides that
default. There is at most one MCP server default per `(agentId, serverId)` and one specific binding
per `(agentId, serverId, rawToolName)`. A deleted server or tool leaves a disabled/dangling binding
for explicit user repair; it never retargets by display name.

The physical SQLite shape and typed Data API are implemented in `agent_tool_binding`. They retain
the `builtin` variant to read existing databases without a destructive migration, but the Host
ignores those legacy rows and the Agent editor drops them on its next binding replacement. MCP
server ids intentionally have no foreign key: deleting a server disables its rows without erasing
their stable identity, display snapshot, or approval. Upsert and replace preserve the row id for a
stable identity, reject duplicates atomically, and cannot create authorization for a missing server
unless that exact dangling identity already exists. Bindings belong to Cherry persistence, the Host
resolves them, and Pi must never read them directly.

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
4. Read the current Agent's enabled MCP bindings and resolve their executable descriptors.
5. Apply system permission state, model tool-calling support, and application policy.
6. Apply the Agent approval preference to the combined system and MCP catalog (`ask → auto` only in
   automatic mode; `deny` remains denied).
7. Freeze stable refs, provider-safe aliases, callbacks, and effective approval modes into `RuntimeTool[]` for
   the turn.

Configuration changes affect the next turn. Permission and resource checks that can change outside
Cherry are repeated inside `execute()` immediately before the side effect. A missing tool, revoked
permission, deleted file, or disconnected server fails closed; the callback never performs a
fallback action with broader access.

The snapshot contains the real executable callbacks. Pi cannot discover and execute an arbitrary
application function by name: every callable target must still exist in the frozen turn catalog.
The Pi binding exposes system capabilities directly and translates eligible MCP tools into three
catalog tools for the active model loop:

- `tool_search` ranks frozen MCP names and descriptions with BM25 and returns at most 20 matches,
  including bounded TypeScript call signatures. Its complete serialized model result is capped by
  both a 32,000-character ceiling and the live model-context headroom; a result that drops matches
  reports `truncated: true`.
- `tool_describe` returns one description and signature bounded by the same live headroom.
- `tool_call` resolves an exact name only inside the frozen catalog and re-enters the target
  `RuntimeTool` approval, cancellation, call-limit, artifact, and event boundary before execution.

The Pi binding keeps a per-turn inspected-name ledger. Each tool whose signature was returned by
`tool_search` or `tool_describe` joins that ledger. Calling an uninspected tool does not enter its
approval or execution boundary: the failed meta result returns the bounded signature and records
the name so a corrected retry can proceed. Before dispatch, `tool_call` also validates `params`
against the frozen MCP JSON Schema; a mismatch returns the same bounded signature without invoking
the target.

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
are never compiled or executed.

## Controlled File Ledger

Mobile has no desktop-style working directory. Every file first enters Cherry managed storage and
receives a [`file_entry`](../data/file-model.md) id. Protocol operations and file tools accept only
that managed id; raw `file://`, `content://`, sandbox, provider, and user-entered paths are transient
import sources, never authority.

The Host creates `TurnResourceLedger` before freezing the built-in catalog. Read tools receive only
its membership view; `generate_image` rejects an `image_id` outside that view before touching the
global managed-file service. A Host-owned catalog wrapper validates and grants every built-in
artifact before returning the tool result to Pi, and Host event projection repeats the grant
idempotently. `write_file` needs no read grant because it only creates entries. `edit_file` is the
deliberate exception to ledger-scoped reads: knowing an active managed `fileEntryId` is sufficient
for it to resolve that source anywhere in the application file library. It never lists or searches
the library, accepts no path, and still creates its output through the Host artifact boundary.

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

Tool results never contain absolute device paths or large base64 payloads. The Pi adapter projects
the typed outer envelope as the model's tool result, so an application artifact's bounded managed
ref remains available for a follow-up tool call while an MCP payload with similar keys stays nested
under `value`. Each artifact is also projected into a Runtime file part; the Host persists it as an
Agent Protocol file part with `purpose: 'artifact'` so the transcript retains its reference and
display metadata. Its content is not automatically projected as a model attachment in later
history. If the managed entry still exists, a user may explicitly attach it again or the model may
read it through a controlled tool; otherwise the reference remains visible as unavailable.

`write_file` returns its status and new `fileEntryId` under `value`, plus the created managed entry
under `artifacts`. `edit_file` additionally returns the source id and replacement count, and marks
its copy-on-write output as `derived`. `generate_image` returns `{ id, name }` refs under `value` and
each imported image under `artifacts`. Pi projects those artifacts as `purpose: 'artifact'` file parts, and the Host
persists both the result envelope and the file parts. Device and web capabilities return portable
JSON with no artifacts.

If a capability delegates work to `JobRuntime`, its Runtime tool still waits for a terminal result
or cancellation during Version 1. A route unmount does not cancel it, but process death interrupts
the Agent turn. Background tool continuation and later turn reattachment require a separate
protocol design and are not implied by the durable job ledger; that design must use the
OS-sanctioned continuation mechanisms described in
[Job Runtime](../job-runtime.md#current-boundaries).

## Capability Rules

### Streamable HTTP MCP

- Persistence retains desktop-compatible `stdio`, `sse`, `streamableHttp`, `inMemory`, and unknown
  transport data unchanged; only `streamableHttp` projects into the mobile Runtime.
- `McpRuntimeService` owns clients, live discovery state, connection disposal, credentials, and wire
  errors. Pi receives sanitized tool definitions and callbacks, never MCP configuration secrets.
- Discovery retains every paginated raw tool name and plain JSON Schema. Selected descriptors are
  adapted with deterministic ref-derived aliases, schema revalidation, a 60-second call bound, and
  a 256 KiB JSON result projection; remote payloads stay under `value` with `artifacts: []`.
- The Host freezes the discovered tools for the turn, including the endpoint URL and live Runtime
  generation that produced them. An endpoint edit, invalidation, or reconnect makes an old callback
  unavailable; rediscovery may populate the next snapshot but never silently retargets the active
  catalog, even when the server row keeps the same URL.
- Third-party MCP bindings project to a base per-call `ask` policy. An explicit `deny` remains
  denied, while any legacy binding-level `auto` row is downgraded to `ask`. The Agent's automatic
  approval mode may then promote that effective turn policy to `auto` without rewriting the row.

### System Calendar

- Calendar adapters own Expo/native API calls and translate platform results into portable JSON.
- Read and mutation tools are separate capabilities so policy can distinguish private-data access
  from side effects.
- OS permission is not an approval substitute. The callback checks both current OS permission and
  the Runtime approval decision immediately before access.
- A missing platform API or denied permission returns a normalized unavailable/permission result;
  it never falls back to another calendar account or remote service.
- Reminder capabilities are iOS-only and are absent from the Android catalog rather than present and
  always failing.
- A device failure settles as a `{ status: 'error', message, retryable }` value rather than a throw,
  because a thrown error reaches the model only as an opaque failure it cannot act on.

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
bounded UTF-8 text (1 MB) as a new entry, and can neither address nor overwrite an existing one. The
model receives `{ status, fileEntryId, filename, size }`; a name it can correct returns
`{ status: 'error', message }` rather than throwing, since a thrown error reaches it only as an
opaque failure.

`edit_file` takes `file_entry_id`, non-empty `old_string`, `new_string`, and optional `replace_all`.
It accepts only active, strictly decoded UTF-8 sources no larger than 1 MiB and creates a same-name,
same-media-type copy no larger than 1 MiB. Matching is exact and case-sensitive: a single edit
requires exactly one non-overlapping match, while `replace_all` changes every non-overlapping match.
It preserves a UTF-8 BOM and all untouched bytes represented by the decoded text. It never uses the
desktop filesystem tool's fuzzy matching, empty-search overwrite, path, or in-place mutation
semantics. The model receives
`{ status, sourceFileEntryId, fileEntryId, filename, size, replacements }` and the new entry is a
`derived` artifact.

Both tools run without approval because they have no destructive form, and the Host offers them only
to models that support function calling. Handing tools to a model that cannot call them fails the
whole turn. Implementation: `src/backend/ai/agent/tools/`.

### Skill Boundary

- Mobile Skill persistence, binding resolution, and prompt projection are not implemented.
- The target contract treats a Skill as instruction context, not a Runtime capability; it cannot add
  tools or change approval, permission, MCP, or managed-resource policy.
- See [Agent Skills](./agent-skills.md) for that explicitly deferred boundary.

## Approval And Failure Policy

Tool configuration, OS permission, turn resource ledger, and per-call approval are independent
gates. All must allow execution. `auto` skips only the interactive approval sheet; it does not
bypass the other gates, expose a missing tool, or broaden application-managed data access. `deny`
is fail-closed and no callback runs.

Every callback receives the turn `AbortSignal`, applies a capability-specific timeout, redacts
credentials and private payloads from errors, and returns portable values. Cancellation propagates
through MCP, provider, device, and file operations where their APIs support it; non-abortable native
work must discard late results after the turn is terminal.

Pi caps each turn at eight tool-loop steps, sixteen requested tool calls, and ten minutes. The MCP
adapter separately caps each remote call at 60 seconds and projects at most 256 KiB of JSON. These
limits are application constants rather than user settings in Version 1.

## Desktop Relationship

Cherry Desktop proves the useful semantics: Pi owns its tool loop, MCP tools are adapted into Pi,
tools are disabled and approved by application policy, and skills are injected explicitly. Mobile
ports those semantics but not the Electron/Node execution surface. Desktop workspaces, shell tools,
JavaScript tool execution, arbitrary filesystem paths, local MCP processes, and executable Skill
trees are explicit mobile exclusions. Streamable HTTP MCP and device/application capability
adapters are semantic ports.

Cloud and LAN desktop control may reuse the user-interface concept of an approval request, but they
do not execute Mobile Agents and must own separate identities, policy, transport, and audit state.
Those future Remote Agent tools are owned and executed by the remote Agent service. They are
different from a local Agent's Streamable HTTP MCP tools: the latter remain in the local Host/Pi
tool loop, while only their individual MCP request crosses to a remote endpoint.

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
