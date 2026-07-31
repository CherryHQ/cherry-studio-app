# Painting

This module owns the painting (image-generation) feature: the composer screen, the drawings tab body
that the messages shell hosts, plus the nested viewer and conversation screens.

## Public Interface

- The composer screen is exported from `index.ts` as `PaintingScreen` (route `/paintings`).
- `index.ts` also exports `DrawingList`, the drawings tab body rendered inside `MessagesScreen/`.
  `usePaintingSelectionSource` backs its multi-select via the shell's `messageTabs` source registry.
- Nested screen areas expose their own `index.ts`: `PaintingViewerScreen/` (route
  `/paintings/[paintingId]`) and `PaintingConversationScreen/` (route
  `/paintings/[paintingId]/conversation`). Route files import from those nested roots.

## Organization

- `components/`, `hooks/`, `utils/` hold the composer's private UI, `usePaintingGeneration`, and the
  shared painting helpers (`paintingDraftHandoff`, `paintingOutputAttachment`, `masonry`,
  `imageGenerationParams`, `imageGenerationLabels`). The nested screens reuse these through relative
  imports as screen-private modules within this one tree.
- `templates/` holds the bundled image-generation prompt templates and their preview row/sheet.
- `DrawingList.tsx` is the drawings tab body; `usePaintingSelectionSource.ts` wraps
  `hooks/usePaintings` into the `messageTabs` selection-source shape the shell consumes.
- `PaintingViewerScreen/` and `PaintingConversationScreen/` are nested screen areas.
- Painting data state lives in `hooks/usePaintings` (queries, delete,
  gallery items) and is consumed here.
