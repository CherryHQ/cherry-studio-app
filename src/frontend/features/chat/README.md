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
- `components/ChatWorkspace/` presents the shared Conversation read model: a snapshot, the
  already-reconciled message rows and a history window. It preserves the shared `MessageList`,
  initial-render gating and pending first-send rows. Message actions and approvals use the bound
  actions carried by those values; the page does not choose an execution implementation, and the
  workspace never receives a session handle.
- `runtime/` owns local chat: `ChatProvider` creates and disposes the `AgentSessionChatClient`,
  refreshes observed Sessions on foreground, invalidates Session queries, and supplies composer and
  navigation extensions. `useLocalConversation` projects the client state through
  `localConversationView` into the shared snapshot, keeps the Session-keyed history window
  (`useAgentMessageHistoryWindow`, cached across route changes) and merges live rows into it by id.
  Local execution settles in-process, so approvals, questions, cancel, retry, fork and delete are
  bound callbacks over the client with inline inputs; there is no session lifecycle, revisioned
  history window, operation journal or deferred resource on the local side. On first send the
  composer changes the route only after admission and carries the originating Agent across that
  handoff while Session detail loads.

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

Search results may specify a message destination. The local history window opens a bounded
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

`remote/RemoteChatScreen` keeps the `/remote` route, page frame, header and composer layout. It
retains a desktop ConversationSource, opens a route Session through the remote-only hooks in
`@/frontend/appShell/conversation/remote`, reconciles live rows with the desktop's history revision
in `remote/ConversationPresenter`, and feeds the shared snapshot and rows into ChatWorkspace. The
sidebar uses the same catalog boundary. Runtime wire state and command recovery stay behind
Backend.remoteAgent; no Controller provider or Controller query keys remain.

`RemoteComposer` owns text editing and registered/system workspace selection. New conversations call the
bound Draft start action, existing conversations call Session send, and stop targets a selected
execution. Backend journals own create/send IDs and uncertain-command recovery. Pending/interrupted
outcomes remain visible in ConversationOperations; navigation does not resend them. The initiating
route can hand an applied creation to its Session without remounting the composer. Late completion
from another route cannot navigate the current view. Unsent text is persisted under its stable
source identity/grant binding, separately from the ephemeral Query scope.

`ConversationMessageContent` renders tool summaries in the shared process layout; a deferred
resource read bound to the row is resolved by the sheet that opens it, and closing the sheet cancels
the read. Attachments currently show metadata because the desktop does not provide file bytes.
ConversationApprovals reads the interaction input (inline for local, deferred for desktop), uses the
bound response action and cancels only the execution associated with the displayed approval.

The matching desktop protocol supports question answers and system-workspace creation. Question
forms consume a bound resource; responses carry complete answers rather than a boolean approval.
The default workspace is offered only when advertised; older desktops still require a registered
workspace. Denial reasons are supported by the protocol but have no editor in the current sheet.
The plus-menu remains disabled and local model/attachment controls remain local.

Both sources share selection preparation and export UI through a small share target (address plus
selection read). See [Service Dependencies And Ownership](../../../../docs/references/remote-access/service-ownership.md)
for source ownership and remaining work. Local regression tests do not establish device acceptance.

Remote header Agent selection preserves the current desktop and unsent draft identity. The composer
and its persisted text belong to that draft, not to the selected Agent. Agent changes remount only
the remote execution controls, so workspace references are acquired for the new Agent. Selecting
from an existing session or an admitted start opens a distinct draft; admission is checked at click
time and navigation invalidates the old handoff immediately. Pending/uncertain operations remain
recoverable and cannot redirect the new draft when their replies arrive.
