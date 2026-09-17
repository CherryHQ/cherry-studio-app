# Painting Input

Shared image composer controls for standalone painting and Agent chat. This module owns image
attachment selection, model selection, and registry-derived generation parameters. It submits a
`PaintingInputSubmission` through `onGenerate`; the caller owns execution, history, and cancellation.
Callers mount `PaintingInputProvider` inside their `ComposerSessionProvider`, around both text and
image controls. They supply successful outputs and an execution callback; the provider retains
reference intent and per-model/per-mode parameter drafts across control switches.

Standalone painting supplies an optional painting and uses a local image model selection. Agent
chat supplies a controlled `modelSelection`, which permits switching between text and image models.
The shared controls do not create painting jobs, navigate, or persist conversation messages.

`createPaintingGenerationStrategy` in shared utilities resolves the callable mode, image limits,
prompt requirements and strict parameter admission from model capabilities. Both backend execution
owners use the same strategy before persisting work, with authoritative managed-file metadata.
`usePaintingInput` applies this policy to the session; `PaintingInput` retains the existing controls
and layout. Readiness checks govern submission without adding persistent inline status copy, new
action rows, or model capability subtitles. Rejected submissions use the existing feedback flow.

A valid single output becomes an automatic reference only for compatible models and untouched
next-turn input. Multiple outputs remain optional candidates. Generate-only models pause automatic
references; incompatible explicit choices remain visible and block sending. Manual attachments
replace automatic references, while explicit references are deduplicated and counted with them.
Refreshing a result does not undo removal, and completion does not overwrite input edited during
generation. Sending hides the reference preview while preserving selection for failure or cancellation.

Parameter drafts retain invalid user edits for correction. First visits use mode defaults and legal
shared values from the same model; returning to a mode restores its saved draft. Submission freezes
and validates the selected model, actual mode, parameters, prompt and participating images.
