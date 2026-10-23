# File Pane

In medium and expanded windows (see [layout](../layout/README.md)), the sidebar's Files destination
and every file preview open in a pane beside the current chat instead of covering it.

- `FilePaneProvider` sits in the drawer layout so the sidebar and chat share one pane state:
  whether it is open and which file it previews. It is available only for the local chat source
  and outside compact windows. Routes pushed over the drawer have no provider and keep opening
  their own pages.
- `FilePaneHost` lays the pane out beside the chat stack in the `(chat)` layout, which composes the
  library and viewer pages. A preview replaces the list in place and returns to it. The pane stays
  mounted once opened, so closing it or narrowing the window keeps the list's mode, folder, filter,
  and scroll position. A hidden pane stays laid out but transparent: `display: none` would remove
  its native views on iOS, losing their scroll and document state.
- Pages in the pane receive `PaneChromeProvider`: their headers and selection toolbars render inline
  and lead with the pane's close or back action.
- A preview's header also offers Expand reading. The preview then fills the chat's space while the
  chat stays mounted behind it, and Back to chat takes the expand button's place. Leaving the
  preview or closing the pane always returns the chat beside it. Android back first returns an
  expanded preview, then leaves the preview, then the pane.
- `useFilePane` lets openers choose the pane. `useOpenFileEntry` is the only file opener that does.
