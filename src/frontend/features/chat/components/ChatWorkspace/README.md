# Chat Workspace

This module owns Agent Session workspace orchestration: structurally shared runtime message
projection, older-message loading state, initial restore cover, message actions, and composer
placement. The virtualized list and message rendering live in `@/frontend/components/Message`.

## Public Interface

- `ChatWorkspace` is exported from `index.ts` for Agent Session screens. It receives the shared
  Conversation snapshot, the reconciled message rows and a history window; each source reconciles
  live rows with history before handing them over. Local chat supplies the exported
  `AssistantMessageUsage` through its `renderUsage` slot; remote chat supplies
  `RemoteAssistantMessageUsage`. Both compose the same button and detail view. Only the local
  adapter reads the mobile usage ledger; the remote adapter presents the host-owned snapshot.
- Internal workspace pieces should be imported through relative paths inside this module.
- The composer placement itself is not here — `ChatScreen` keeps the shared composer in normal
  parent flow, while CherryUI owns reusable keyboard and safe-area behavior. This module only
  connects the remaining list geometry to Chat.

## Organization

- `components/` contains loading, cover, message context menus, and the assistant action toolbar
  composed through `AssistantMessage`. `ChatScreen` mounts the composer session directly because it owns whether the
  input exists and must keep that session outside its session/empty-state branch.
- `context/` owns message copy/share actions and assistant toolbar state/actions. Dynamic
  copied/busy/enabled state is consumed only by toolbar leaves; context menus consume only actions,
  and the virtualized list and expensive message body do not subscribe. Action handlers read the
  latest transcript and snapshot when invoked, so their identities change only when an action's
  availability does, not on every streamed update.
- `context/` also owns each row's conversation state beyond its list item: tool calls, attachments,
  and the timestamp boundary. Rows subscribe to it by message id and only rows whose state changed
  are woken. The list's `extraData` carries only list-wide presentation, because changing it
  refreshes every mounted row.
- `hooks/` owns the cover handoff after the list controller completes initial restoration.
- `utils/` contains pure helpers with co-located tests, including copyable-text projection.

Fork provenance stays on the Session, not in persisted Messages. When the copied boundary Message
is present in the paginated window, `ChatWorkspace` inserts a presentation-only system row after it;
until that boundary loads, the divider remains absent rather than attaching to a page edge.

With message actions enabled, long-pressing a settled user or assistant message opens copy and
share using the platform's default timing. iOS presents its native context menu; Android positions
CherryUI's menu at the long-press pointer, adjusted to stay inside the screen's safe area.
Copy uses the toolbar's existing text projection and clipboard action; content
without copyable text disables copy. Share opens the existing selector with the pressed message
selected. The menu carries non-destructive actions only: message text is selectable, so a long
press competes with the native selection gesture and resolves on whatever region the finger
reaches. Pending messages have no menu actions; their wrapper stays mounted so settling does not
recreate the streamed body. Android's scroll boundary cancels
menu recognition during drag and momentum; iOS relies on UIKit arbitration. The main answer's text
region is a `ContextMenuExclusion`, so holding the answer selects text instead of opening the
menu. Process details keep their own
selection and scrolling inside a `ContextMenuExclusion`, as do source entry points, attachments,
errors, and the assistant toolbar.

Deleting a turn is a toolbar action, not a menu action. The assistant toolbar shows it on any row
that carries a turn id — a synthetic divider or a send that has not been reserved yet has none —
and it confirms destructively before removing the pressed answer together with the question that
produced it: a transcript replays tool calls paired with their results, so half a turn is not
replayable. The button is disabled while the Session is busy, like retry, because a running turn's
rows must not disappear underneath it.
Holding these regions belongs to the child interaction and does not open the message menu.

`ChatWorkspace` observes the native screen-reader setting once for all rows. When enabled, settled
user messages show explicit copy/share buttons, including a share action for attachment-only
messages. Assistant messages keep their existing toolbar. These controls sit outside the message
content's accessibility nodes; the complete row is never grouped into a single accessible element
that would hide attachments or inline controls. A late initial status response cannot overwrite a
newer setting-change event.
