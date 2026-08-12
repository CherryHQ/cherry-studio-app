# Painting

This module owns the painting (image-generation) feature: the message-style composer screen, the
drawings tab body that the messages shell hosts, plus the nested viewer.

## Public Interface

- The composer screen is exported from `index.ts` as `PaintingScreen` (route `/paintings`).
- `index.ts` also exports `DrawingList`, the drawings tab body rendered inside `MessagesScreen/`.
  `usePaintingSelectionSource` backs its multi-select via the shell's `messageTabs` source registry.
- `PaintingViewerScreen/` owns route `/paintings/[paintingId]`. The former
  `/paintings/[paintingId]/conversation` route redirects old links to the unified composer.

## Organization

- `components/`, `hooks/`, `utils/` hold the composer's private UI, `usePaintingGeneration`, and the
  shared painting helpers (`paintingDraftHandoff`, `paintingMessages`, `paintingOutputAttachment`,
  `masonry`, `imageGenerationParams`, `imageGenerationLabels`).
- `templates/` holds the bundled image-generation prompt templates and their preview row/sheet.
- `DrawingList.tsx` is the drawings tab body; `usePaintingSelectionSource.ts` wraps
  `hooks/usePaintings` into the `messageTabs` selection-source shape the shell consumes.
- `PaintingViewerScreen/` is the nested full-screen image area.
- Painting data state lives in `hooks/usePaintings` (queries, delete,
  gallery items) and is consumed here.
