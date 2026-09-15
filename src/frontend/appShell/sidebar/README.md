# Sidebar

This App Shell module owns the drawer navigation surface, recent Agent Sessions, and bottom dock.
It is app-wide navigation infrastructure rather than a route page.

The drawer remains a temporary overlay on every window size, with its width capped at 400 logical
points and at least 64 points of chat left visible. Tablet support does not change destination or
back-navigation behavior.

The circular search button beside the sidebar title opens the shared `/search` page for all
conversations. Before a query is entered, it shows the ten most recently active conversations.
Title matches use the cursor-paginated `/agent-sessions?q=...` collection and message matches use
`/search/contents`.
Nonempty input waits 250ms before querying. Each group advances through its own "Load more" action;
an empty message batch with more history offers "Continue searching". Message previews are compact
excerpts around the first keyword and keep code text intact. Selecting a title opens its Session; selecting a message also
carries its message id and a fresh navigation request id so repeated selections locate it again.
Search uses the shared transient selection contract and closes before opening the chat.

The sidebar owns conversation browsing, rename, and individual deletion. There is no separate
Session history/management route or chat-header history action.

The recent-list menu switches between a flat conversation list and conversations grouped by Agent.
Only the current chat's Agent starts expanded, falling back to the first Agent when no chat is
selected. Tapping an Agent's header toggles its conversations without navigating; multiple groups
can stay open, and explicit toggles take precedence over the default. Only expanded groups query
Sessions by their Agent id, show ten initially, and own independent "Load more" actions.
Conversation rows retain selection, status, navigation, rename, and deletion. Agent headers only
toggle their groups. The existing dock's "New chat" action opens a draft, where the user can
select an Agent.
Within Agent groups, Agent names, conversation titles, and pagination actions share one text
column. Grouped conversation and pagination rows keep the avatar column empty; the ordinary
conversation list has no avatar column and retains its original left gutter. Selection surfaces
keep the same outer gutters across groups.
