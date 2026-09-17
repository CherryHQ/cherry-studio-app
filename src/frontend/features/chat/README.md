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
- `workspace/` merges persisted transcript rows with live Agent messages, adapts protocol parts into
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
