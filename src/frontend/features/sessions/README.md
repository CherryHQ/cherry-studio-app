# Agent Session Screens

This page owns `/sessions`, backed by the `/agent-sessions` Data API.

## Public Interface

- `SessionListScreen` (`/sessions?view=sessions|agents`) is the management page. The default
  recency-ordered view supports rename, delete, and multi-select batch deletion under the
  `agent-sessions` selection scope. The Agent view expands each Agent into its own lazy Session
  query and keeps soft-deleted Agents in a fallback group.
- Reusable list state and presentation shared with the App Shell sidebar live in
  `src/frontend/components/SessionList`.
- Rows link to the Agent chat surface with a `sessionId` param.
- Search opens the `/search` route rather than filtering the list in place. The list is a
  cursor-paginated infinite query, so filtering what happens to be loaded would silently miss
  sessions further down; the route queries `/search/entities` for titles and `/search/contents` for
  message text, and a result press navigates to that session in chat.
- Batch deletion issues per-id deletes (`useAgentSessionMutations`); the backend cancels and
  drains an active turn before removing a session.

## Organization

`SessionListScreen.tsx` owns route parameters, page header, search, and selection toolbar. Shared
session list UI and state remain outside the page so the sidebar does not import page-private code.
