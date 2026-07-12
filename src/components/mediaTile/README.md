# Media Tile

Shared square (112x112) preview tiles for images and generic files. Used both
for staged chat-input attachments and for rendering sent `file` message parts,
so the two contexts share one visual language instead of drifting apart.

## Public Interface

- `ImageTile` — square rounded thumbnail for an image `uri`. Optional
  `onPress` makes it tappable; omit it for a static (non-interactive) tile.
  `fill` makes it size to its parent box instead of the default 112x112, for
  callers that own the outer sized container (e.g. an animated wrapper).
  `children` renders overlay content (badges) on top of the image.
- `FileTile` — square bordered tile with the uppercased file extension in a
  bordered chip top-left, and the extension-less filename (wraps up to 3
  lines) pinned bottom-left. Optional `onPress` makes it tappable.
- `getFileExtension` / `getFileBaseName` — pure helpers that split a filename
  into the uppercased, truncated extension and the base name shown by
  `FileTile`.

## Organization

- `components/ImageTile.tsx`, `components/FileTile.tsx`: the two tiles.
- `utils/getFileExtension.ts`: pure filename parsing, with tests.

## Behavior notes

- Neither tile bakes in remove/selection badges — callers compose those as
  `children` (for `ImageTile`) or as siblings inside their own wrapper, since
  those affordances only make sense while composing a message, not once it's
  been sent.
