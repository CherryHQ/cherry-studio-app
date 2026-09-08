# SessionList

This shared component family owns Agent Session list state, list presentations, selection, and row
actions used by both the `/sessions` page and the App Shell sidebar.

Route headers, route search, and navigation composition remain with their consumers.

`SessionStatus` subscribes to the Host's latest turn status without loading messages. Both list
presentations show approval, running, failure, or unread completion in that priority order; cancelled
and interrupted turns are quiet. Completion is acknowledged per turn by the visible chat, shared
through frontend memory cache. Status and read receipts reset when the app restarts, matching Desktop.
