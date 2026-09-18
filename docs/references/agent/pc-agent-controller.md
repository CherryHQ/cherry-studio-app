# PC Agent Controller

Status: mobile implementation against Cherry Desktop Remote Agent wire version 1. Device
interoperability and execution flows have not yet been tested. This extends the application-facing
Agent Protocol as version 2; it does not change the local version 1 Host/Runtime contract.

## First-phase product scope

The mobile remote source is a conversation client for existing PC Agents. This phase covers:

- Fetching and selecting PC Agents, without modifying them.
- Cursor-paginated conversation lists for the selected Agent.
- Fetching conversation history and loading older history pages on demand.
- Starting a conversation under the selected PC Agent and choosing an existing registered PC
  workspace, with the PC default workspace available.
- Sending messages and receiving live replies and execution state.
- Receiving approval/question events, displaying them in the conversation flow, and returning
  the user's approval, denial, or answers to the PC.

The drawer's Local/Remote group and the existing chat presentation remain the interaction contract.
Agent creation, editing, deletion, and changes to models, instructions or tools stay on the PC.
This is an explicit product boundary, independent of whether a later PC API exposes those writes.
Workspace selection does not create, edit or browse arbitrary PC workspaces.

Reconnection, stale-state protection and uncertain-command recovery support this conversation flow.
The additional adapter capabilities documented below do not expand this phase's implementation or
acceptance scope; no further peripheral feature work is implied by reusing the chat UI.

## Ownership and implementation

```text
Drawer Local / Remote group → shared chat surface
  → Backend.agentController.open(connectionId)
  → AgentController v2 (application views, commands, connection state)
  → RemoteAgentAdapter (projection, source lifecycle, recovery)
  → RemoteAgentClient + secureChannel (Cherry Remote v1 WebSocket)
  → PC execution and persistence
```

- `src/shared/contracts/agent/controller.ts` owns the PC application contract. Capabilities become
  UI operations, snapshot freshness is explicit, and resource references are opaque and bound to a
  pairing generation. It contains no frames, keys, request IDs, or PC filesystem operations.
- `src/backend/services/remoteAgent` implements that contract. `RemoteAgentRuntime` is an
  application lifecycle service with one retained adapter per opened device. Navigation releases
  observations; the final source lease and background transitions suspend its socket. Returning
  refreshes discovery, performs a fresh handshake, and restores observations. Neither leaving a
  screen nor disconnecting cancels PC execution.
- `DesktopConnectionRuntime` remains the credential owner. Its existing device token is reused;
  there is no second authorization list or token. A separate SecureStore value holds the pairing
  generation and pinned PC identity. Pair/remove operations notify the adapter owner.
- `desktopConnectionClient` now uses the existing shared HTTP client for `/pair`, provider export,
  and `/v1/remote-agent`. Each candidate address receives an immutable credential-scoped route,
  bounded response size, caller cancellation, a 4-second deadline, and rejected redirects. The
  domain chooses another paired address on transport failure; the shared transport does not retry.
- `src/frontend/appShell/navigation/chat` owns the drawer's local/remote source navigation and
  remembers each source's last target. The existing Conversations/Agents menu adds a second
  Local/Remote group; `sidebar` renders PC Agent groups and conversations in the same drawer.
- `src/frontend/appShell/remoteAgent` owns controller leases, connection state and paginated PC
  queries shared by the drawer, header and chat. The flat conversation view enumerates Agents
  because the PC `sessions.list` endpoint requires an Agent ID.
- `src/frontend/features/chat/remote` owns the PC conversation adapter. It uses the drawer's
  `/remote` route and shares `ChatScreenFrame`, `MainHeaderView`,
  `ChatTranscript`, `ChatMessage`, `ChatInputSurface`, message-copy feedback and the selection/export
  flow with local chat. There is no separate PC Agent/session navigation tree or device-detail
  chat entry. Remote records never enter local Agent/Session/message tables.

Resource reads belong to the retained authenticated controller session. They do not create a
second persistent Data API for PC objects. TanStack Query owns their frontend cache and pagination;
cache keys include the pairing generation. Only drafts and outgoing action recovery are persisted
on mobile, alongside downloaded attachments and automatically loaded image files.

## Current protocol mapping

| User operation | PC interface |
| --- | --- |
| Discover and negotiate | `GET /v1/remote-agent`, `system.info` |
| Agents, registered workspaces, conversations | `agents.list`, `workspaces.list`, `sessions.list` |
| New conversation | `sessions.create` with optional registered `workspaceId` |
| History and current state | `messages.list`, `sessions.get`, `session.subscribe`, `unsubscribe` |
| Send, stop, recover uncertain result | `messages.send`, `turns.cancel`, `commands.get` |
| Approval or question | Snapshot interaction markers, `interactions.get`, `interactions.respond` |
| Tool and complete text details | `messages.parts.list`, `messages.parts.get` |
| Artifact download | `artifacts.read` |

Users select Remote in the drawer and choose a paired PC there. Tapping its Agent or conversation
keeps the main chat interaction. The header starts a draft and displays the current Agent without
a click action; Agent switching stays in the drawer.
The workspace control follows the local model picker's input expansion/collapse behavior. Drafts
can choose a registered PC workspace or the PC default. The first send passes that choice to `sessions.create`;
existing conversations display the snapshot's workspace as read-only because the PC protocol has
no workspace-change command. The accepted handoff retains composer identity. Pending text uses the shared message
presentation, rejected sends restore the draft, and uncertain creates are recovered before another
session can be created. Input drafts are scoped to the pairing generation as well as the chat.
Stops use the normal composer button; multiple concurrent executions open a choice sheet.
The plus trigger stays visible and disabled. Interaction, detail and artifact sheets retain their
protocol behavior.

Tool calls are projected into the shared process disclosure in their original PC order. Mounted
assistant rows read the lightweight `messages.parts.list` directory (names, states and field
references) and refresh it while the focused session is streaming. No argument or output values
are loaded for the summary. Pressing a single-line tool summary mounts its `MessagePart.Tool` detail
content and reads `messages.parts.get`; closing the sheet cancels pending content reads. Normal
messages have no generic details footer. Truncated text retains an explicit full-content entry.

Remote messages use the same copy menu, selection page and export preview. Export reloads selected
messages from the bound PC and refuses incomplete or unsettled content. Artifacts export as named
attachments. Images load automatically into the shared image preview; other files use the standard
file row and download on press. The PC does not expose
rename, delete, fork, model selection, attachment upload or full-text search interfaces, so those
local-only controls are not offered in remote mode. Mobile never browses arbitrary PC directories
or submits local model IDs.

### Snapshots and recovery

PC `session.snapshot` events are full execution overlays, not text deltas or complete history.
The adapter validates and normalizes them, preserves original part indices as stable identities,
and filters by source connection, subscription, epoch, and sequence. The UI replaces the live layer
and merges it with history by message ID. It refreshes history after terminal persistence;
`finalizing` remains an active state. Disconnect makes the snapshot stale, disabling stale stops
and responses until fresh state arrives. Reconnection has no event replay and fetches state again.

All new user actions persist one ID and unchanged parameters synchronously in
`RemoteAgentCommandJournal` before being sent. A lost response stays uncertain. Recovery queries
`commands.get` and resubmits only the same action when the receipt is absent. Reads have unique
request IDs. PC `accepted` and `queued` are admission receipts, never execution completion.
Unsent offline drafts remain drafts and are not automatically sent on reconnection. Replacement
pairing generations isolate old resources and pending actions; old pairing records without this
binding require a new scan for Agent access, while configuration sync remains available.

Message history supplies status and content parts. Session snapshots supply live messages,
active execution IDs and interactions. The controller does not project message-level execution
metadata or expose input-state/background-task APIs. The conversation merges live messages with
history by message ID and refreshes durable history when active execution IDs change or a terminal
snapshot arrives. Command recovery
reads admission/control receipts without interpreting them as per-message execution progress.
An interrupted command remains interrupted and is not automatically sent again.

The encrypted transport uses Expo native randomness, TweetNaCl's precomputed box shared secret and
secretbox, and Noble SHA-256/HKDF. It checks the pinned key/instance, transcript confirmation,
session/direction/counter headers, frame bounds, and strict UTF-8. Keys and nonces are fresh per
connection. Ordered requests stay below the PC request rate, reserve control capacity, and time
out rather than leave an uncertain request hanging indefinitely.

### Interactions and files

Question UI recognizes the PC's `AskUserQuestion`/`builtin_AskUserQuestion` input, supports multiple
questions, single/multiple selection and free text, and preserves the original input when adding
answers. Other tools present their original approval input. Decisions obey current `canRespond`;
already resolved decisions refresh state instead of creating execution locally.
Pending requests automatically enter the local chat's shared `ToolApprovalSheet`, with the same
non-dismissible queue and approval actions; there is no separate pending-request button. Single
and multiple choice questions use CherryUI selection rows. The remote adapter only owns content
loading, response transport and connection gating. Response targets are projected from persisted
command parameters so an uncertain or acknowledged response does not reopen from an old snapshot.

Text/JSON detail pages use UTF-8 byte offsets and one content revision. JSON is parsed only after
all pages arrive. A changed revision restarts from zero once. Artifact chunks are decoded
individually and written as bytes to a temporary file; cancellation prevents subsequent pages.
Completed files use existing managed storage and preview, preserving original bytes and extensions.
PC paths are never accepted as download targets. Limits are 16 MiB for expanded text/JSON and
256 MiB for a downloaded artifact. Detail values and non-image files load only after explicit user
interaction. Images load with their message and reuse source-scoped cached downloads; the lightweight
part directory may also load with the message to render tool summaries. Tool rows and approval
sheets share localized titles for known PC native tools while retaining unknown tool names.

## PC source

Reviewed the requested desktop working tree on 2026-09-18 at HEAD
`8b3d229e0a8d2279784cf385593bbc3bc0b971b0`. The remote-access implementation is uncommitted,
so the commit alone does not identify the reviewed source. No desktop files were modified.

The current wire protocol remains version 1. Its message projection, snapshot, method registry,
and capability list define the mobile controller surface described above. Workspace selection,
text submission, live replies, cancellation, tool details and approval responses remain supported.
The feature is not released; removed input/task functionality has no compatibility or migration layer.

The read-only `desktop:sync:audit` for `services` refuses the dirty selected desktop sources and
produces no structured domain hash. This change follows the explicitly requested working-tree
contract; the sync manifest remains unbaselined and was not advanced.

## Verification boundary

Changed TypeScript files pass Oxlint and ESLint; changed source/locale files are formatted with Oxfmt.
Regression sources cover current command receipts, preservation of command IDs during recovery,
and live-message/approval projections. Obsolete input/task code, fixtures and labels are removed.
The full repository lint attempt reported unresolved existing `@cherrystudio/ai-core` package imports
(the workspace package has not been built). Only lint and formatting are authorized for this task. Tests, typecheck, builds, simulators and
manual UI checks are deliberately not run. New secure-channel and action-recovery tests, plus updated desktop HTTP/runtime and bootstrap
fixtures, must be run by the user with the relevant suites before release. Native crypto/WebSocket behavior,
weak-network recovery and the full PC/mobile product flow still require device verification.

### Drawer/chat redesign verification

The source-switch and shared-chat redesign was formatted with Oxfmt and reviewed with focused
Oxlint and ESLint. Menu grouping updated the Nitro specification and regenerated native bindings.
The new source and incomplete-content labels are directly translated into all 13 locales.
No test suite, typecheck, native build, simulator or manual UI acceptance was run for this change.
The previously produced Android APK is unchanged and does not include this redesign.
