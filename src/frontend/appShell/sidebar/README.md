# Sidebar

This App Shell module owns the drawer navigation surface, recent Agent Sessions, and bottom dock.
It is app-wide navigation infrastructure rather than a route page.

The search entry opens the shared `/search` page for all conversations. Title matches use the
cursor-paginated `/agent-sessions?q=...` collection and message matches use `/search/contents`.
Each group advances independently. Selecting a title opens its Session; selecting a message also
carries its message id and a fresh navigation request id so repeated selections locate it again.
Search uses the shared transient selection contract and closes before opening the chat.

The sidebar owns conversation browsing, rename, and individual deletion. There is no separate
Session history/management route or chat-header history action.
