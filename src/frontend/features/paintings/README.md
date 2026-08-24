# Painting

This module owns the painting (image-generation) feature: the message-style composer screen, the
painting history screen, plus the nested viewer.

## Public Interface

- The composer screen is exported from `index.ts` as `PaintingScreen` (route `/paintings`).
- `index.ts` also exports `PaintingHistoryScreen`, which hosts `DrawingList`. It is a drawer scene
  (route `/drawings`, reached from the sidebar) rather than a pushed page, so it leads with a
  hamburger. `usePaintingSelectionSource` backs its multi-select via the shared `selection` source
  registry.
- `PaintingViewerScreen/` owns route `/paintings/[paintingId]`. The former
  `/paintings/[paintingId]/conversation` route redirects old links to the unified composer.

## Organization

- `components/`, `hooks/`, `utils/` hold the composer's private UI, `usePaintingGeneration`, and the
  shared painting helpers (`paintingDraftHandoff`, `paintingMessages`, `paintingOutputAttachment`,
  `imageGenerationParams`, `imageGenerationLabels`).
- `templates/` holds the bundled image-generation prompt templates and their preview row/sheet.
- `DrawingList.tsx` is the virtualized masonry history list body; `usePaintingSelectionSource.ts` wraps
  `hooks/usePaintings` into the `selection` source shape the history screen consumes.
- `PaintingViewerScreen/` is the nested full-screen image area. It supplies the painting-specific
  route, file resolution, chrome, and capability actions while the shared `artifactPreview` module
  owns the source-to-target navigation transition and zoomable image surface.
- Painting data state lives in `hooks/usePaintings` (queries, delete,
  gallery items) and is consumed here.
