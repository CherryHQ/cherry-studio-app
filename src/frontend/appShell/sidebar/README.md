# Sidebar

This App Shell module owns the drawer navigation surface, recent Agent Sessions, and bottom dock.
It is app-wide navigation infrastructure rather than a route page.

The drawer remains a temporary overlay on every window size, with its width capped at 400 logical
points and at least 64 points of chat left visible. Tablet support does not change destination or
back-navigation behavior.

The circular search button beside the sidebar title opens the shared `/search` page for local
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
Conversation rows share selection and navigation; status, rename and deletion are supplied by the
source preview contract. Local previews retain these capabilities without opening transcripts.
Remote previews currently omit them because the desktop catalog does not supply them. Agent header labels
toggle their groups. The existing dock's "New chat" action opens a draft, where the user can
select an Agent.
Within Agent groups, Agent names, conversation titles, and pagination actions share one text
column. Grouped conversation and pagination rows keep the avatar column empty; the ordinary
conversation list has no avatar column and retains its original left gutter. Selection surfaces
keep the same outer gutters across groups.

The existing Conversations/Agents action menu has a second Local/Remote section. `ChatSourceProvider`
keeps the source-specific view mode and last chat target. Both sources mount `SidebarConversationList`
inside `ConversationSourceBoundary`; the same Agent groups, rows, pagination, selection and menu
presentation consume catalog summaries and bound preview actions. `SidebarDesktopSource` owns only
device selection and connection framing. Its device menu appears only when multiple devices are
saved; device management stays in Settings.
The original local sidebar is the visual and interaction baseline for both sources. Agent headers
keep the full-width avatar/name/disclosure row; tapping anywhere on that row only toggles the
group. New chat stays in the existing bottom dock, with no per-Agent new-chat icon. Row gutters,
text columns, selection/pressed surfaces, empty/loading/error spacing and pagination feedback
follow the local presentation. Avatar rendering is shared; desktop emoji is preserved, while a source without avatar metadata uses
the common fallback.
A connected PC is represented by a green status dot beside the view/source
heading, with the device name retained in its accessibility label. Connection problems keep their
message and recovery action. Source switching stays inside the drawer chat stack. Remote mode does
not route into the local Agent editor or local full-text search.

Conversation source acquisition and loaded content share the same header frame, including a reserved status
dot slot. For remote sources, one 200 ms loading-feedback delay spans controller acquisition, connection, and the first
list request; it never delays data. Normal connecting/reconnecting states do not insert a banner
above the list. Pending queries do not render empty rows, and cached lists remain
visible if a background refresh fails. Device discovery must finish before showing the unpaired
empty state.

Both catalogs use appShell/conversation hooks and ConversationSourceBoundary. Rows receive
Agent summaries and ConversationRefs, and navigation uses the common conversation address helper.
Device selection still reads the pairing directory; action availability comes from the conversation
source. Local Data API metadata changes invalidate the catalog; lightweight Host status and read marks
update individual rows. Search availability is supplied by the sidebar navigation owner. Concurrent readers share catalog requests. The last reader cancels unfinished reads and releases
connection demand; completed metadata remains briefly in memory for reopening the sidebar.
