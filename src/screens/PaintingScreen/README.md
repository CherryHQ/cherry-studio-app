# Painting

This module owns the painting (image-generation) feature: the composer screen plus its nested
viewer and conversation screens.

## Public Interface

- The composer screen is exported from `index.ts` as `PaintingScreen` (route `/paintings`).
- Nested screen areas expose their own `index.ts`: `PaintingViewerScreen/` (route
  `/paintings/[paintingId]`) and `PaintingConversationScreen/` (route
  `/paintings/[paintingId]/conversation`). Route files import from those nested roots.

## Organization

- `components/`, `hooks/`, `utils/` hold the composer's private UI, `usePaintingGeneration`, and the
  shared painting helpers (`paintingDraftHandoff`, `paintingOutputAttachment`, `masonry`,
  `imageGenerationParams`, `imageGenerationLabels`). The nested screens reuse these through relative
  imports as screen-private modules within this one tree.
- `templates/` holds the bundled image-generation prompt templates and their preview row/sheet.
- `PaintingViewerScreen/` and `PaintingConversationScreen/` are nested screen areas.
- App-level painting state lives outside this module in `src/hooks/paintings` (queries, delete,
  gallery items) and is consumed here.

## Pending (screens reorg — Stage 2)

- The drawings gallery/tab body (`DrawingList`) still lives in `TopicListScreen/` and cross-imports
  this module's `templates`, `utils/masonry`, and `utils/paintingDraftHandoff`. Stage 2 moves
  `DrawingList` into this module and reframes `TopicListScreen` into a neutral messages shell,
  removing that cross-owner import.
