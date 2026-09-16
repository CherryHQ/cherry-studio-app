# Painting Input

Shared image composer controls for standalone painting and Agent chat. This module owns image
attachment selection, model selection, and registry-derived generation parameters. It submits a
`PaintingInputSubmission` through `onGenerate`; the caller owns execution, history, and cancellation.
It must be inside the caller's `ComposerSessionProvider` so switching controls preserves the draft.

Standalone painting supplies an optional painting and uses a local image model selection. Agent
chat supplies a controlled `modelSelection`, which permits switching between text and image models.
The shared controls do not create painting jobs, navigate, or persist conversation messages.

Callers keep `usePaintingReference` mounted with the composer and supply successful outputs. A
single output becomes the editing reference; multiple outputs require selection or dismissal.
The controls show the reference, allow removal or replacement, and deduplicate it with manual
attachments before deriving the generation mode and submitting. Sending immediately clears the
reference preview while retaining its selection for failure or cancellation recovery. The preview
returns with the new successful output, or with the previous selection if the request fails or is
cancelled. Refreshing the same output does not undo an explicit removal.
