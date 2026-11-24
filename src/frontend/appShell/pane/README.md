# Files Master-Detail

`LibraryMasterDetailHost` composes the file library and its preview in the `/library` route.
The route supplies the library screen and a `renderPreview` callback; the host owns the selected
file identity and layout, while the viewer owns file loading and rendering.

- In `wide-rail` mode, the host renders a collapsible master list beside the selected file preview,
  or an empty state until a file is selected. The regular list width is 288 logical points; a
  vertical fold adjusts it through the shared [layout](../layout/README.md) fold geometry.
- In compact and vertical-rail modes, the host renders only the library screen. File opening uses
  the ordinary viewer route instead of the detail column.
- The navigation shell owns the list's collapsed preference. The host reports its current list
  width back to the shell so shared sheet bounds match the visible columns.
- Each wide-mode column receives `PaneChromeProvider` from `appShell/layout`, so headers and
  toolbars render inline. The master header aligns left, and the preview header can toggle the
  list when the fold geometry allows it. The host owns the columns' top safe-area padding.

`LibraryMasterDetailContext` shares `LibraryMasterDetailState`: whether master-detail mode is
active, the list's collapsed state and toggle, and the selected file identity and setter.
`useLibraryMasterDetail` returns that state inside the host, or `null` outside it. Selection lives
for the host's lifetime; this context does not persist file data or navigation history.

Routes import `LibraryMasterDetailHost` from `@/frontend/appShell/pane`. Consumers that need only
`LibraryMasterDetailState` and `useLibraryMasterDetail` use the public
`@/frontend/appShell/pane/state` entry without loading the host's UI dependencies.
