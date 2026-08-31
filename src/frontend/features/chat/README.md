# Chat Screen

This module owns the Agent Session chat screen, input, live projection, and workspace
behavior. Structured message rendering is shared with painting through
`@/frontend/components/messages`.

## Public Interface

- `ChatScreen` is exported from `index.ts`.

## Organization

- `ChatScreen.tsx` is header + swappable body + composer session in normal parent flow. With a
  Session the body is the conversation; selecting an Agent without one shows an isolated Draft.
  The Host creates the durable Session together with its admitted first message, and the frontend
  switches composer identity only after that operation succeeds.
- `input/` owns the narrow Agent Protocol wrapper around the shared composer. Agent settings are
  edited on the Agent screen; image attachment admission failures restore the managed draft and
  surface a user-facing reason.
- `workspace/` merges persisted transcript rows with live Agent messages, adapts protocol parts into
  the shared `MessageList`, and owns history loading, initial-render gating, and approvals.
- `runtime/` owns the route-scoped `AgentSessionChatClient`, observes the app-owned Mobile Agent Host
  through `Backend.agent`, and owns frontend navigation and query invalidation effects. On first
  send it changes the route only after the new Session has accepted the submission.
