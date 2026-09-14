# Chat Workspace

This module owns Agent Session workspace orchestration: structurally shared runtime message
projection, older-message loading state, initial restore cover, message actions, and composer
placement. The virtualized list and message rendering live in `@/frontend/components/Message`.

## Public Interface

- `ChatWorkspace` is exported from `index.ts` for Agent Session screens.
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
  and the virtualized list and expensive message body do not subscribe.
- `hooks/` owns the cover handoff after the list controller completes initial restoration.
- `utils/` contains pure helpers with co-located tests, including copyable-text projection.

Fork provenance stays on the Session, not in persisted Messages. When the copied boundary Message
is present in the paginated window, `ChatWorkspace` inserts a presentation-only system row after it;
until that boundary loads, the divider remains absent rather than attaching to a page edge.

With message actions enabled, holding a settled user or assistant message for 1.5 seconds opens
CherryUI's context menu with copy and share. Copy uses the toolbar's existing text projection and
clipboard action; content without copyable text disables copy. Share opens the existing selector
with the pressed message selected. Pending messages have no menu actions; their gesture wrapper
stays mounted so settling does not recreate the streamed body. The list's existing scroll boundary
cancels menu recognition during drag and momentum. Main-answer text selection stays disabled while
message actions are enabled. Process details keep their own selection and scrolling inside a
`ContextMenuExclusion`, as do source entry points, attachments, errors, and the assistant toolbar.
Holding these regions belongs to the child interaction and does not open the message menu.
