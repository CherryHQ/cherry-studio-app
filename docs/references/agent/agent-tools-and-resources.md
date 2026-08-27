# Agent Tools And Controlled Resources

> Status: as-built. Version 1 is local-only.

The system catalog ships device calendar and reminders, health, location, web search and fetch,
image generation, and `write_file`, all using the settled `ToolRef` and `{ value, artifacts }`
contracts. For each turn the Host resolves that catalog against model tool support, platform, OS
permission, app configuration, and composer-selected temporary capabilities, then combines it with
the Agent's persisted executable MCP bindings. Calendar, reminders, health, location, and
`write_file` are available to every Agent when their system gates pass. Web search and image
generation enter only the turn whose composer selected them; they are never Agent configuration.
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
own platform, permission, application-configuration, approval, and optional temporary-capability
gates. The Agent editor neither reads nor overrides it.

`web_search` and `web_fetch` require the turn-local `web-search` capability. `generate_image`
requires `image-generation` and a configured drawing model. The composer sends these selections on
`submitMessage`; a successful send clears them, and they are never persisted on the Agent. System
device and file capabilities have no Agent-specific switch. The inference snapshot records the
tools that entered the immutable turn.

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
```

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
2. Read temporary system capability selections from this submission.
3. Project only system capabilities implemented and available on the current mobile platform.
4. Read the current Agent's enabled MCP bindings and resolve their executable descriptors.
5. Apply system permission state, model tool-calling support, and application policy.
6. Freeze stable refs, provider-safe aliases, callbacks, and approval modes into `RuntimeTool[]` for
   the turn.

Configuration changes affect the next turn. Permission and resource checks that can change outside
Cherry are repeated inside `execute()` immediately before the side effect. A missing tool, revoked
permission, deleted file, or disconnected server fails closed; the callback never performs a
fallback action with broader access.

The snapshot contains the real executable callbacks. Pi cannot discover and execute an arbitrary
application function by name. Version 1 does not expose a shell, workspace, JavaScript code mode,
dynamic extension, unrestricted filesystem tool, or catalog-expanding meta-tool.

## Controlled File Ledger

Mobile has no desktop-style working directory. Every file first enters Cherry managed storage and
receives a [`file_entry`](../data/file-model.md) id. Protocol operations and file tools accept only
that managed id; raw `file://`, `content://`, sandbox, provider, and user-entered paths are transient
import sources, never authority.

The Host creates `TurnResourceLedger` before freezing the built-in catalog. Read tools receive only
its membership view; `generate_image` rejects an `image_id` outside that view before touching the
global managed-file service. A Host-owned catalog wrapper validates and grants every built-in
artifact before returning the tool result to Pi, and Host event projection repeats the grant
idempotently. `write_file` needs no read grant because it only creates entries.

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

An MCP payload or model-produced string never grants access merely because it looks like a
`cherry://file/` ref. An MCP result is ordinary remote data unless a separate Cherry importer
validates its bytes, creates a managed entry, and records the new id. The ledger never grants access
to the whole file library or app sandbox.

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
under `artifacts`; `generate_image` returns `{ id, name }` refs under `value` and each imported image
under `artifacts`. Pi projects those artifacts as `purpose: 'artifact'` file parts, and the Host
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
- Third-party MCP tools execute only with per-call `ask` approval in this version. An explicit
  `deny` remains denied, while any legacy `auto` row is downgraded to `ask` during projection.

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
- Cost-bearing or externally submitted generation uses the application-owned `ask` policy; Agents
  cannot override it. `generate_image` is absent from the catalog unless the composer selected image
  generation for the turn and a drawing model is configured. Its input schema is built from that
  model's capability block so the model is never offered a parameter its provider rejects.

### Managed File Write

`write_file` is the only general file writer. It accepts a display name rather than a path, writes
bounded UTF-8 text (1 MB) as a new entry, and can neither address nor overwrite an existing one. The
model receives `{ status, fileEntryId, filename, size }`; a name it can correct returns
`{ status: 'error', message }` rather than throwing, since a thrown error reaches it only as an
opaque failure. It runs without approval because it has no destructive form, and the Host offers it
only to models that support function calling. Handing tools to a model that cannot call them fails
the whole turn. Implementation: `src/backend/ai/agent/tools/`.

### Skill Boundary

- Mobile Skill persistence, binding resolution, and prompt projection are not implemented.
- The target contract treats a Skill as instruction context, not a Runtime capability; it cannot add
  tools or change approval, permission, MCP, or managed-resource policy.
- See [Agent Skills](./agent-skills.md) for that explicitly deferred boundary.

## Approval And Failure Policy

Tool configuration, OS permission, turn resource ledger, and per-call approval are independent
gates. All must allow execution. `auto` skips only the interactive approval sheet; it does not
bypass the other gates. `deny` is fail-closed and no callback runs.

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
  extend the turn resource ledger, and `write_file` never overwrites an existing entry.
- Mobile Skills cannot add tools, approvals, credentials, or resource-ledger grants.
- Cancellation, denial, unavailable tools, and process interruption all fail closed without late
  side effects entering the transcript or non-terminal tool calls entering later model history.
