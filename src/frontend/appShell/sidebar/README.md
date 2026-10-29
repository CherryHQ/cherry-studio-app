# Sidebar

This App Shell module owns the drawer navigation surface, recent Agent Sessions, and bottom dock.
It is app-wide navigation infrastructure rather than a route page.

In compact windows the drawer is a temporary overlay, with its width capped at 400 logical points
and at least 64 points of chat left visible. Wide windows (see [layout](../layout/README.md)) make
it a permanent column beside the content region, divided by a hairline. `useSidebarColumn` resolves
that column through the pure `resolveSidebarColumn`: 280 points for the sidebar, the file pane width
for search, the leading half of the window when an iPhone Duo is partly folded, yielded entirely
while the file pane holds the column beside a focused chat, or collapsed when the user hid it.
`SidebarColumnProvider` owns whether the column shows the sidebar or search, and the
`ui.sidebar.collapsed` preference. A partly folded Duo ignores that preference: hiding the column
would leave the chat across the fold.

The header's leading sidebar button is the one entry for every width. `SidebarToggleProvider` wraps
the drawer and publishes `resolveSidebarToggleAction` for the column through `useSidebarToggle`,
exported from `@/frontend/appShell/sidebar/toggle` so headers do not load the sidebar UI: `open`
for the overlay, `hide` or `show` for a wide column, and nothing while the file pane or a fold holds
it. Hiding and showing switch the drawer between its permanent and closed overlay types in one step:
animating the column's width would relayout the chat on every frame. Swiping only opens the
overlay in compact windows. Navigation state reports a permanent drawer as closed, so visibility comes from
`useSidebarPresence`: `persistent`, `open`, or `closed`. Selection mode, the title marquee, and read
receipts use it instead of the raw drawer status.

In a wide window the sidebar stays beside every page in the content region, so its actions read the
content stack when they run. Agents, Paintings, Plugins, Skills, and the avatar's Settings push above
the chat, or take the place of the destination already open, and the matching row (or the avatar)
shows selected through `resolveSidebarDestination`. Conversation rows, New chat, device switching,
and Files first pop the content region back to the chat. Plugins and Skills act for the chat beside
the sidebar, or the one a page covers, which `ChatSourceProvider` keeps as `localChat`; the provider
also keeps the covered chat's source, so the sidebar does not switch catalogs while Settings fills
the content region. Files opens the [file pane](../pane/README.md) in place of the sidebar and stays
selected while the pane is open beside the chat. In compact windows the `/library` page carries the
current local chat, so its previews can add files to that chat.

The floating dock insets from the sidebar's leading safe area only: the column sits at the window's
leading edge, so a trailing safe area such as an iPhone Duo's status bar never reaches it. Rows
scrolled under the dock blur toward the bottom edge, as they do under the title row.
`useSidebarHeaderTop` places the title row below the top safe area, except where the chat header
fills that inset (an upright iPhone Duo inner display) or keeps its own margin below a zero inset
(the same display on its side); there the row centers on the header's controls.

The circular search button beside the sidebar title opens the shared `/search` page for local
conversations in compact windows. In wide windows the same request renders as `AppSearchPanel` in
the left column: selecting a result opens its chat beside the panel and marks it, and the close button
returns the column to the sidebar. Before a query is entered, it shows the ten most recently active conversations.
Title matches use the cursor-paginated `/agent-sessions?q=...` collection and message matches use
`/search/contents`.
Nonempty input waits 250ms before querying. Each group advances through its own "Load more" action;
an empty message batch with more history offers "Continue searching". Message previews are compact
excerpts around the first keyword and keep code text intact. Selecting a title opens its Session; selecting a message also
carries its message id and a fresh navigation request id so repeated selections locate it again.
The `/search` page uses the shared transient selection contract and closes before opening the chat.

The sidebar owns conversation browsing, rename, and individual deletion. There is no separate
Session history/management route or chat-header history action.

Multi-select deletion removes sessions serially so active work settles before its rows are deleted.
Deleted rows hide immediately, and each removal's catalog change notification refreshes the lists;
selection never refreshes them itself. Failed deletions remain selected for retry.

The recent-list menu switches between a flat conversation list and conversations grouped by Agent.
Every Agent group starts collapsed, including the current chat's. Tapping an Agent's header toggles
its conversations without navigating; multiple groups can stay open. Only expanded groups query
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

The drawer title names whose chats it shows: "Cherry Studio" for this phone, or the selected
desktop's name. The name always reads in full and never ends in an ellipsis: a long one shrinks
from 24 to at most 18 points, and one that still overflows is clipped and scrolls by in a single
marquee lap each time the drawer opens or the name changes (`SidebarTitle` documents the motion;
reduced motion keeps it still). Without a paired desktop it stays plain text. Once any desktop is saved, a centered
disclosure chevron follows it and tapping opens a native menu listing "Cherry Studio" first, then
every saved desktop, with a separate "Manage devices" entry that opens Device Connections; pairing,
renaming and removal stay in Settings. The Conversations/Agents menu only switches the list view.
`ChatSourceProvider` keeps the source-specific view mode and last chat target; returning to the
last desktop resumes its chat, while another desktop opens at its catalog. Both sources mount
`SidebarConversationList` inside `ConversationSourceBoundary`; the same Agent groups, rows,
pagination, selection and menu presentation consume catalog summaries and bound preview actions.
`SidebarDesktopSource` owns only connection framing.
The original local sidebar is the visual and interaction baseline for both sources. Agent headers
keep the full-width avatar/name/disclosure row; tapping anywhere on that row only toggles the
group. New chat stays in the existing bottom dock, with no per-Agent new-chat icon. Row gutters,
text columns, selection/pressed surfaces, empty/loading/error spacing and pagination feedback
follow the local presentation. Avatar rendering is shared; desktop emoji is preserved, while a source without avatar metadata uses
the common fallback.
A connected PC is represented by a green status dot beside the list view heading, with the device
name retained in its accessibility label. Connection problems keep their message and recovery
action. Source switching stays inside the drawer chat stack. On a desktop, the drawer shows only
what exists there: the search button and the Agents, Paintings, Plugins, Skills and Library rows are hidden
because they manage this phone.

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
