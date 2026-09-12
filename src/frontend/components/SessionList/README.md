# SessionList

This component family owns Agent Session list state, status, and rename/delete actions consumed by
the App Shell sidebar. The sidebar owns row presentation and navigation.

Global conversation search belongs to the sidebar and uses the shared App Search route.

`SessionStatus` subscribes to the Host's latest turn status without loading messages. Rows
show approval, running, failure, or unread completion in that priority order; cancelled
and interrupted turns are quiet. Completion is acknowledged per turn by the visible chat, shared
through frontend memory cache. Status and read receipts reset when the app restarts, matching Desktop.
