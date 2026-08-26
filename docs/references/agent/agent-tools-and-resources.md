# Agent Tools And Controlled Resources

Status: **tool binding persistence, HTTP MCP Runtime adaptation, and Host projection implemented**.
Version 1 is local-only.

This document defines how Cherry Mobile exposes application capabilities to Pi. Pi remains the
sole conversation engine and owns the model → tool → result loop. Application services own every
side effect, credential, system permission, managed file, and provider-specific capability.

## Dependency Rule

```text
Mobile Agent Host
    ├─ resolves Agent tool bindings
    ├─ creates a Host-owned turn resource ledger
    └─ builds an immutable RuntimeTool[] snapshot
            ↓
        Pi Runtime
            ↓ RuntimeTool.execute()
    application capability adapter
            ├─ Streamable HTTP MCP
            ├─ device calendar
            ├─ Office generation, inspection, and patching
            ├─ image generation → AiService / @cherrystudio/ai-core / AI SDK
            └─ managed-file read and copy-on-write edit
```

Pi never imports `AiService`, AI SDK, Expo modules, SQLite services, or MCP persistence. A
capability adapter closes over the narrow application service it needs and is exposed to Pi only as
a [`RuntimeTool`](./agent-runtime.md#tools). AI SDK and `@cherrystudio/ai-core` are model-capability
implementations behind those adapters; they never become a second conversation Runtime.

## Tool Catalog And Bindings

The application owns two different representations:

- A durable **tool binding** says which application capability or MCP source an Agent may use and
  its approval policy.
- A turn-local **Runtime tool** contains the provider-safe name, description, JSON Schema, approval
  mode, and execution callback Pi can use for one immutable turn.

Every executable tool also has an application-stable identity:

```ts
type ToolRef =
  | { source: 'builtin'; capabilityId: string }
  | { source: 'mcp'; serverId: string; rawToolName: string }
```

`ToolRef` is the persistence, approval, and audit identity. The provider-safe function name is a
turn-local execution alias derived deterministically from the stable ref; server display names and
generated aliases are never authority. Alias generation includes the source namespace and a stable
digest, rejects collisions within the snapshot, and never falls back to display-name matching. The
Host snapshots a display name separately so historical UI remains understandable after
configuration changes.

The logical binding model is:

```ts
type AgentToolBinding =
  | {
      agentId: string
      source: 'builtin'
      capabilityId: string
      enabled: boolean
      approval: 'auto' | 'ask' | 'deny'
    }
  | {
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
default. There is at most one built-in binding per `(agentId, capabilityId)`, one MCP server default
per `(agentId, serverId)`, and one specific binding per `(agentId, serverId, rawToolName)`. A deleted
server or tool leaves a disabled/dangling binding for explicit user repair; it never retargets by
display name.

The physical SQLite shape and typed Data API are implemented in `agent_tool_binding`. MCP server
ids intentionally have no foreign key: deleting a server disables its rows without erasing their
stable identity, display snapshot, or approval. Upsert and replace preserve the row id for a stable
identity, reject duplicates atomically, and cannot create authorization for a missing server unless
that exact dangling identity already exists. Bindings belong to Cherry persistence, the Host
resolves them, and Pi must never read them directly.

The data resolver chooses a specific tool row before its server default, then combines that policy
with the current stored Server state and caller-supplied discovery fact. It reports `unbound`,
`binding-disabled`, `server-unavailable`, or `tool-unavailable` instead of silently falling back.
A temporarily undiscovered tool keeps its stored `enabled` value; only its effective result is
unavailable. This resolver returns configuration facts only and does not create or inject a Runtime
tool.

## Snapshot Resolution

Before admitting a turn, the Host resolves tools in this order:

1. Read the current Agent's enabled built-in and MCP bindings.
2. Project only capabilities implemented on the current mobile platform.
3. Resolve configured MCP servers and their currently enabled tool descriptors.
4. Create the turn resource ledger from controlled managed-file facts.
5. Apply system permission state, model tool-calling support, and application policy.
6. Freeze stable refs, provider-safe aliases, callbacks, and approval modes into `RuntimeTool[]` for
   the turn.

Configuration changes affect the next turn. Permission and resource checks that can change outside
Cherry are repeated inside `execute()` immediately before the side effect. A missing tool, revoked
permission, deleted file, or disconnected server fails closed; the callback never performs a
fallback action with broader access.

The snapshot contains the real executable callbacks. Pi cannot discover and execute an arbitrary
application function by name. Version 1 does not expose a shell, workspace, JavaScript code mode,
dynamic extension, or unrestricted filesystem tool. If a large MCP catalog later needs discovery,
Cherry may add bounded search/describe/call meta-tools, but no meta-tool may expand the frozen
catalog or bypass its individual approval policies.

## Controlled File Ledger

Mobile has no desktop-style working directory. Every file first enters Cherry managed storage and
receives a [`file_entry`](../data/file-model.md) id. Protocol operations and file tools accept only
that managed id; raw `file://`, `content://`, sandbox, provider, and user-entered paths are transient
import sources, never authority.

For Version 1, the Host derives the initial ledger grants from:

- managed files attached to the current user input;
- managed file parts already visible in the Session transcript whose entries remain available; and
- files created by earlier tools in the same active turn.

The Host creates a `TurnResourceLedger` containing explicit readable and derivable `fileEntryId`
sets. Its initial grants are frozen from input and transcript facts. During the turn it may grow only
when an application capability successfully imports a new file and the Host-owned wrapper validates
and records that id before the callback resolves. The tool catalog and approval policy remain
immutable; only this ledger grows monotonically.

An MCP payload or model-produced string never grants access merely because it looks like a
`cherry://file/` ref. An MCP result is ordinary remote data unless a separate Cherry importer
validates its bytes, creates a managed entry, and records the new id. The ledger never grants access
to the whole file library or app sandbox. A future “allow this Agent to access these library files”
feature earns an explicit persisted relation, not a broad directory path.

Managed content is immutable. An edit tool reads an allowed entry, creates a new entry, and returns
the new reference. It never overwrites the source blob. The source and result remain separate
library entries, making every edit copy-on-write and preserving the original.

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

If a capability delegates work to `JobRuntime`, its Runtime tool still waits for a terminal result
or cancellation during Version 1. A route unmount does not cancel it, but process death interrupts
the Agent turn. Background tool continuation and later turn reattachment require a separate
protocol design and are not implied by the durable job ledger; that design must use the
OS-sanctioned continuation mechanisms recorded in
[Agent Architecture](./README.md#open-questions).

## Office Files

Office support is one application capability family, not a model or renderer contract. The model's
tool call is already the controlled structured-generation step; Version 1 does not start a hidden
AI SDK request to turn prose into a second JSON payload. Cherry validates the call and
deterministically generates or patches the file with a replaceable local renderer.

### Application Contracts

Cherry owns separate, versioned JSON contracts for new-file generation and existing-file edits:

- `DocumentSpecV1`, `WorkbookSpecV1`, and `PresentationSpecV1` describe semantic content such as
  sections, sheets, slide layouts, tables, charts, style presets, and managed image references.
- `DocumentEditOperationV1`, `WorkbookEditOperationV1`, and `PresentationEditOperationV1` describe
  bounded operations against an imported file revision, such as replacing a paragraph, writing a
  cell range, or replacing text in one slide shape.

These names describe logical contracts; their physical TypeScript modules land with the Office
capability. Each contract has one strict Zod source of truth that exports portable JSON Schema for
the Runtime tool. Unknown fields fail validation. Contracts use `fileEntryId` for managed inputs and
never expose renderer classes, provider options, device paths, raw OOXML, ZIP entries, macros, or
executable code.

The contracts remain stable when the local implementation changes. A renderer adapter translates
the Cherry contract into an open-source library's API; library-specific input must not leak back
into the tool definition, transcript, or persistence model.

### New File Generation

Document, workbook, and presentation creation are separate capabilities because their useful
schemas and limits differ. A generation callback:

1. validates the versioned Cherry spec and every referenced managed file;
2. resolves only the style preset, template, and assets authorized by the call;
3. invokes the local format renderer with the turn `AbortSignal` and size limits;
4. imports the completed `.docx`, `.xlsx`, or `.pptx` bytes into managed storage; and
5. returns the new entry as a `created` artifact.

The renderer owns OOXML correctness, packaging, temporary bytes, and cleanup. Pi never sees binary
output. A template is an in-scope managed Office file, not a path or executable Skill; filling one
creates a derived entry and never mutates the template.

### Existing File Inspection And Edit

An Office file must be imported into managed storage before an Agent can inspect or edit it. The
inspector returns bounded metadata, compatibility warnings, outlines, and revision-local selectors;
callers read additional content by page, section, sheet/range, slide, or selector instead of loading
the entire file into model context.

Edit tools accept the source `fileEntryId` plus format-specific operations that target selectors
returned for that exact revision. A selector is not authority and cannot be reused with another
entry. The callback rechecks the source ledger grant and operation limits, patches a copy, validates
the result, and imports it as a `derived` artifact. Further edits target the new entry and re-inspect
it when new selectors are needed.

The patch engine preserves package parts and relationships it does not understand. It must not parse
only Cherry's supported subset and regenerate the whole file, because that would silently discard
unsupported Office features. When preservation cannot be guaranteed, the inspector reports the
limitation and the mutation fails closed rather than returning a lossy file.

### Initial Surface And Scope

The logical built-in catalog is:

- `create_document`, `create_workbook`, and `create_presentation`;
- `inspect_office_file` and `read_office_content`; and
- `edit_document`, `edit_workbook`, and `edit_presentation`.

Version 1 supports controlled new-file generation, managed-template filling, and a documented set
of format-specific patch operations. It does not promise a full Office editor, arbitrary OOXML
mutation, legacy `.doc`/`.xls`/`.ppt`, macro-enabled files, format conversion, or pixel-identical
rendering. The capability matrix must identify supported content and operations before an edit is
offered.

Generated and derived files remain inside Cherry's file library. Saving or sharing one to a system
destination is an explicit user action; it copies the bytes out and never makes the external path
authoritative. If export later becomes an Agent tool, it is a separate side-effecting capability
with its own approval policy.

## Capability Rules

### Streamable HTTP MCP

- Persistence retains desktop-compatible `stdio`, `sse`, `streamableHttp`, `inMemory`, and unknown
  transport data unchanged; only `streamableHttp` projects into the mobile Runtime.
- `McpRuntimeService` owns clients, discovery caches, connection disposal, credentials, and wire
  errors. Pi receives sanitized tool definitions and callbacks, never MCP configuration secrets.
- Discovery retains every paginated raw tool name and plain JSON Schema. Selected descriptors are
  adapted with deterministic ref-derived aliases, schema revalidation, a 60-second call bound, and
  a 256 KiB JSON result projection; remote payloads stay under `value` with `artifacts: []`.
- The Host freezes the discovered tools for the turn. A reconnect may refresh the next snapshot but
  cannot silently replace the active catalog.
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

### Image Generation

- The image tool calls an application-owned generation capability that may use `AiService`,
  `@cherrystudio/ai-core`, and AI SDK internally.
- Pi supplies the validated generation request but does not construct provider SDK options or own
  provider credentials, usage accounting, download, persistence, or cleanup.
- Successful output is imported into managed file storage before the tool reports an artifact.
- Cost-bearing or externally submitted generation defaults to `ask`; the Agent binding may choose a
  different policy explicitly.

### Office Generation

- Office tools use the Cherry-owned specs and edit operations defined in
  [Office Files](#office-files); open-source renderer schemas are private adapter details.
- Every successful generation or edit returns `.docx`, `.xlsx`, or `.pptx` as a managed artifact.
- Existing-file edits require an in-scope source entry, preserve unsupported package content, and
  always produce a new entry.

### Managed File Read And Edit

- Read tools accept only an in-scope `fileEntryId` and return bounded extracted content or metadata,
  not an arbitrary path.
- Edit tools use format-specific application services and copy-on-write output. There is no generic
  unrestricted byte writer in Version 1.
- Input size, extracted-text size, generated-file size, timeout, and cancellation limits are
  enforced by the capability service before provider or filesystem work grows without bound.

### Skill Boundary

- The Host resolves only the Mobile Skills enabled in the current Agent configuration.
- A Skill is instruction context, not a Runtime capability, and cannot add tools or change approval,
  permission, MCP, or managed-resource policy.
- Skill loading, prompt projection, and history behavior remain follow-up design. See
  [Agent Skills](./agent-skills.md).

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
- Office, image, and edited-file outputs are managed artifacts backed by validated `file_entry` ids.
- Office tool inputs use versioned Cherry specs or edit operations rather than raw OOXML,
  executable code, paths, or renderer-specific objects.
- Office edits are copy-on-write and fail closed when unsupported content cannot be preserved.
- File reads and edits cannot escape the explicit turn resource ledger; only validated
  application-created outputs can extend it, and edits never mutate source bytes.
- Mobile Skills cannot add tools, approvals, credentials, or resource-ledger grants.
- Cancellation, denial, unavailable tools, and process interruption all fail closed without late
  side effects entering the transcript or non-terminal tool calls entering later model history.
