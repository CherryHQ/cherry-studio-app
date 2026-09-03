# Chat Screen

This module owns the Agent Session chat screen, input, live projection, and workspace
behavior. Structured message rendering is shared with painting through
`@/frontend/components/Message`.

## Public Interface

- `ChatScreen` is exported from `index.ts`.

## Organization

- `ChatScreen.tsx` keeps the page frame outside the chat-content route-parameter subscription. The
  header and a focused content leaf resolve their own route-derived data independently; the content
  leaf swaps the body and composer between Session and Draft targets. The Host creates the durable
  Session together with its admitted first message, and the frontend hands the accepted Draft to
  that Session without remounting the composer. Navigating elsewhere still starts an isolated
  composer identity.
- `input/` owns the narrow Agent Protocol wrapper around the shared composer. Agent settings are
  edited on the Agent screen; image attachment admission failures restore the managed draft and
  surface a user-facing reason.
- `workspace/` merges persisted transcript rows with live Agent messages, adapts protocol parts into
  the shared `MessageList`, and owns history loading, initial-render gating, and approvals.
- `runtime/` owns the route-scoped `AgentSessionChatClient`, observes the app-owned Mobile Agent Host
  through `Backend.agent`, and owns frontend navigation and query invalidation effects. On first
  send it changes the route only after the new Session has accepted the submission, and carries the
  originating Agent across that one route handoff while Session detail loads.
