# Chat Screen

This module owns the Agent Session chat screen, input, live projection, and workspace
behavior. Structured message rendering is shared with painting through
`@/frontend/components/Message`.

Message sharing is owned by `share/`. The assistant toolbar opens a separate summary
selection page; confirming the selected messages opens the existing export preview. The original
message list keeps its geometry and selection does not subscribe into the chat renderer.

## Public Interface

- `ChatScreen` is exported from `index.ts`.

## Organization

- `ChatScreen.tsx` keeps the page frame outside the chat-content route-parameter subscription. The
  header and a focused content leaf resolve their own route-derived data independently; the content
  leaf swaps the body and composer between Session and Draft targets. The Host creates the durable
  Session together with its admitted first message, and the frontend hands the accepted Draft to
  that Session without remounting the composer or message list. Navigating elsewhere still starts an isolated
  composer identity.
- `components/ChatInput/` owns the narrow Agent Protocol wrapper around the shared composer. Agent settings are
  edited on the Agent screen; image attachment admission failures restore the managed draft and
  surface a user-facing reason.
- `components/ChatWorkspace/` merges persisted transcript rows with live Agent messages, adapts protocol parts into
  the shared `MessageList`, and owns history loading, initial-render gating, and approvals.
- `runtime/` owns the route-scoped `AgentSessionChatClient`, observes the app-owned Mobile Agent Host
  through `Backend.agent`, and owns frontend navigation and query invalidation effects. On first
  send it changes the route only after the new Session has accepted the submission, and carries the
  originating Agent across that one route handoff while Session detail loads.

`useAgentChatControls` runs once in the content leaf, keyed by the existing composer identity.
Its send action allocates Session/message IDs and synchronously displays the text, files, and
assistant waiting row before awaiting preparation. The same IDs pass through the normal send
function into persistence and events. `ChatWorkspace` merges the pending rows with formal messages
by ID and releases the pending send once both rows are available. The list uses the preallocated
Session ID throughout the first-send navigation, including turns that finish before observation.
A rejected send removes the pending rows and the shared composer restores the draft. Leaving the
composer isolates its pending work and prevents a late completion from navigating the new view.

The visible, focused chat acknowledges the current completed turn through `useSessionReadReceipt`.
Previews, an open drawer, and background routes do not clear the list's unread completion indicator.

Search results may specify a message destination. `useAgentMessageHistoryWindow` opens a bounded
window around that message and supports pagination in both directions. It shows the full target
window rather than trimming it to the usual recent-message render window. Until its newer edge
reaches the live transcript, the workspace excludes live rows to avoid displaying a false contiguous
history. Sending or pressing return-to-latest replaces the window with the latest messages.
Message navigation leaves composer identity tied to the Session.

The Agent editor and chat model picker accept both text and image models. `ChatInput` owns the
selected model while its Agent update settles. It renders the text controls or the shared
`PaintingInput` controls without changing the composer Session or message list. Image sends use
`Backend.agent.startSession` / `submitMessage`, just like text sends; they never create painting
history. The Host stores outputs as assistant file parts, and the drawer opens the same Session.
Per-message image settings drive the generation placeholder even if the Agent later changes models.
`PaintingInputProvider` retains reference intent and parameter drafts in the current composer session.
Compatible models can automatically use a single successful output when next-turn input is untouched;
multiple outputs remain optional candidates. Generate-only models pause automatic references and
block incompatible explicit images. The shared input strategy owns these rules. Effective references
are submitted as file parts and stay separate from the text draft; text controls do not attach them.

## Local and remote presentation

The first remote phase is limited to reading/selecting PC Agents, paginated Agent conversation
lists, conversation history, new conversations with a registered PC workspace, message submission,
live replies, and approval/question events and responses. PC Agent creation, editing and deletion
remain outside the mobile scope, including model, instruction and tool configuration.

The drawer selects the source before opening the chat. `remote/RemoteChatScreen` adapts PC-owned
conversations on `/remote` within the same drawer stack. Both sources compose `ChatScreenFrame`,
`MainHeaderView`, `ChatTranscript`, `ChatMessage` and `ChatInputSurface`. Runtime state stays with
its source; copy feedback, header Agent labels, composer geometry, scrolling and sharing stay
with these common presentation owners. Remote capabilities determine which actions are offered.

Agent switching stays in the left drawer. The remote workspace control uses the same secondary
action slot and input expansion/collapse behavior as the local model picker. Drafts can select a
registered PC workspace or the PC default; existing conversations display their workspace from the
PC snapshot as read-only.
Workspace selection is disabled while disconnected or a session creation is pending.
The plus-menu trigger stays visible and disabled.

Remote tools join reasoning and intermediate text in the shared process disclosure, in PC part
order. The lightweight part directory supplies names and states; each tool uses the same single-line
`MessagePart.Tool` summary as local chat. Opening that row mounts its detail content and reads
arguments/results into the shared bottom sheet. Closing it removes the content observers and cancels
pending reads. Tool rows resolve the remote controller and connection before opening the sheet and
pass them to deferred content explicitly; the sheet host does not inherit the route provider.
`remoteToolTitle` maps the PC Pi, DSH and Claude native tool names to Mobile translations, shared
by tool rows and interaction sheets. It reuses existing file, web and meta-tool titles, and keeps
unknown/custom MCP names intact. Display mapping never changes the controller's tool identity.
Successful action receipts, repeated outgoing text, and the generic message-details
footer are omitted. Failures, unresolved actions, downloadable files, and the full-text entry for
truncated messages remain available. The controller has no message-level execution metadata or
background-task API/UI.

Remote image attachments load automatically and use the shared `FileEntryImage` preview and
viewer. Other files use `FileAttachmentPreview` metadata rows and read their bytes only on press.
Artifact queries are scoped to the connection/source and resource, reuse successful downloads, and
cancel in-flight reads when their rows unmount. Source-owned attachments use `ChatMessage`'s
attachment slot, so user attachments sit above the bubble and assistant artifacts follow the body.

Remote drafts and session handoff retain one composer identity. Recovered uncertain creates reuse
the existing PC session; sending waits for fresh PC state. The previous dedicated remote Agent
and session screens have been removed. See the [PC controller reference](../../../../docs/references/agent/pc-agent-controller.md).
