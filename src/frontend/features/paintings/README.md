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

The standalone workspace uses `PaintingWorkspaceInput`: prompt, attachment preview and send share
one row on the existing composer surface. The menu prioritizes four common parameters and shows
their current values. Common registry parameters open individually in the
shared anchored popover; free text, custom dimensions and other parameters remain available in the
existing sheet. Agent chat keeps the stacked `PaintingInput` presentation.

Each successful turn is retained when a follow-up begins. Earlier outputs become thumbnails while
the current result stays large, with Edit, Compare and Save actions. This timeline is screen-session
state: reopening a record loads that generation, not an inferred chain of related records. Version
numbers are local to this workspace; multiple images from one generation are candidates of the same
version. Comparison uses the retained outputs and lets the user explicitly choose the editing source.

`PaintingImageEditor` shares the mounted composer and painting-input session. Selecting an output
for editing replaces the participating input images with that output, preserving the prompt draft.
Only one native input is mounted at a time. Model selection and per-mode parameters survive the
switch. A single-image edit/resize handoff opens this editor directly; multi-image handoffs retain
the ordinary workspace so none of the participating images are hidden.

The editor displays the original reference inside the requested output frame. Its hit target fits
the original image, so normalized annotation positions exclude letterboxing and remain stable when
the keyboard or aspect ratio changes. The canvas reserves the measured dock height and follows the
same keyboard displacement as the dock, keeping the entire reference above the input. Deferred
annotation focus reads the committed input handle and is cancelled when the editor unmounts.
Tap and native scrolling cancel normally; selecting an
existing marker stops propagation instead of adding another. Native text selection in the timeline
is excluded from background keyboard dismissal. Viewing/zooming remains owned by the existing image
viewer; annotation mode uses taps rather than competing with its zoom gesture.

Written location notes and the whole-image brief are frozen before capability validation and file
preparation. The model receives localized original-image coordinates; the current timeline receives
the human editing brief. These notes guide the image model through its existing reference-image
contract: they are not masks or pixel-constrained edits. The persisted prompt retains the complete
model instructions. Annotation drafts are retained per source within the mounted workspace, not
stored in a new database schema. Completion does not close an editor containing newer input.

`PaintingInputProvider` owns reference selection and parameter drafts. Its shared strategy only
includes references accepted by the selected model; multiple outputs remain optional candidates.
Successful outputs never replace input edited during generation. Each generation still creates
its own painting record. A failed follow-up keeps the previous result visible, and cancellation
restores its prompt, output dimensions, and route. The viewer's generation-details action opens
the existing record; Edit and Resize hand off the selected image to the composer. Resize offers
only the selected model's declared edit dimensions and carries the exact parameter key/value,
including models declaring pixel sizes instead of aspect ratios.
