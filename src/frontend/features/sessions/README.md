# Agent Session Screens

This module owns the Agent Session list surfaces backed by the `/agent-sessions` Data API. It is
the agent-session successor to the topic list feature, which remains in place until the chat
surface switches to Agent Sessions.

## Public Interface

- `SessionListScreen` (`/sessions`) is the management page: recency-ordered infinite list with
  rename, delete, and multi-select batch deletion under the `agent-sessions` selection scope.
- `SessionList` embeds the list with its own `SessionListProvider`, mirroring `TopicList`.
- Rows link to the chat surface with a `sessionId` param — the post-switch contract the chat
  screen ignores until it consumes Agent Sessions.
- There is no search: the session list API has no query filter yet; content search arrives with
  the desktop-shaped search work.
- Batch deletion issues per-id deletes (`useAgentSessionMutations`); the backend cancels and
  drains an active turn before removing a session.

## Organization

- `context/SessionListProvider.tsx` owns list data plus optimistic rename; deletion reuses the
  optimistic batch delete in `src/frontend/hooks/agent`.
- Cross-screen UI comes from neutral modules under `src/frontend/components`.
