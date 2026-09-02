# Paintings Pages

This page branch owns the `/paintings` composer and its nested viewer flow.

- `PaintingScreen.tsx` owns the composer page.
- `viewer/` owns `/paintings/[paintingId]`.
- `viewer/conversation/` owns the legacy conversation child route and redirects into the unified
  composer.
- `components/`, `hooks/`, and `utils/` contain code private to this page branch.

The independent `/drawings` history page lives in `src/frontend/features/drawings`. Painting queries
and job observation shared by both pages live in `src/frontend/data/paintings`; draft handoff lives
in `src/frontend/utils/paintingDraftHandoff.ts`; preview transitions shared by both pages live in
`src/frontend/components/ArtifactPreview`.
