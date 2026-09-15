# Painting Input

Shared image composer controls for standalone painting and Agent chat. This module owns image
attachment selection, model selection, and registry-derived generation parameters. It submits a
`PaintingInputSubmission` through `onGenerate`; the caller owns execution, history, and cancellation.
It must be inside the caller's `ComposerSessionProvider` so switching controls preserves the draft.

Standalone painting supplies an optional painting and uses a local image model selection. Agent
chat supplies a controlled `modelSelection`, which permits switching between text and image models.
The shared controls do not create painting jobs, navigate, or persist conversation messages.
