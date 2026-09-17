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

`PaintingComposer` uses `@/frontend/components/PaintingInput` for the image prompt, attachments,
model picker, and parameter sheet. Agent chat shares those controls but submits through the Agent
Host. Only this standalone painting workflow creates painting history entries and painting jobs.

`PaintingInputProvider` owns reference selection and parameter drafts. Its shared strategy only
includes references accepted by the selected model; multiple outputs remain optional candidates.
Successful outputs never replace input edited during generation. Each generation still creates
its own painting record. A failed follow-up keeps the previous result visible, and cancellation
restores its prompt, output dimensions, and route. The viewer's generation-details action opens
the existing record; Edit and Resize hand off the selected image to the composer.
