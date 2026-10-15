# Painting Input

Shared image composer controls for the painting board and Agent chat. This module owns image
attachment selection, model selection, and registry-derived generation parameters. It submits a
`PaintingInputSubmission` through `onGenerate`; the caller owns execution, history, and cancellation.
Callers mount `PaintingInputProvider` inside their `ComposerSessionProvider`, around both text and
image controls. The provider retains reference intent and per-model/per-mode parameter drafts across
control switches, and holds the local model selection so switching presentations does not reset it.

`PaintingInput` is the Agent-chat presentation: attachments above the field, then a toolbar with the
+ menu, the settings action, and the model pill. Agent chat supplies a controlled `modelSelection`,
which permits switching between text and image models.

`PaintingWorkspaceInput` is the painting board's single row: the + menu, the attached reference,
the field, and send. Nothing in the row is a form control. The + menu offers photos, camera, and
generation settings. That sheet is the only parameter surface, one continuous page: the model row
first, then shape, count, quality, and background, then the remaining registry parameters. Choices
of up to four options are segmented controls; longer lists open their own page. Ratio cells show the
ratio and the header adds the selected size's pixels. An unset parameter shows the value the model
will use.

A caller that attaches its own reference image passes `adoptSubmittedReference={false}` so a sent
image is not adopted as the next turn's reference; Agent chat keeps the default and continues from
its single submitted image.

An optional `preparePrompt` freezes image-local instructions before prompt validation and asynchronous
file preparation. It does not bypass the generation strategy or change parameter admission. The
`displayPrompt` on a submission is the human brief; backend requests use `prompt`, and the painting
board persists the brief beside it.

`createPaintingGenerationStrategy` in shared utilities resolves the callable mode, image limits,
prompt requirements and strict parameter admission from model capabilities. Both backend execution
owners use the same strategy before persisting work, with authoritative managed-file metadata.
`usePaintingInput` applies this policy to every presentation. Readiness checks and rejected submissions
use the existing feedback flow.

A valid single output becomes an automatic reference only for compatible models and untouched
next-turn input. Multiple outputs remain optional candidates. Generate-only models pause automatic
references; incompatible explicit choices remain visible and block sending. Manual attachments
replace automatic references, while explicit references are deduplicated and counted with them.
Refreshing a result does not undo removal, and completion does not overwrite input edited during
generation. Sending hides the reference preview while preserving selection for failure or cancellation.

Parameter drafts retain invalid user edits for correction. First visits use mode defaults and legal
shared values from the same model; returning to a mode restores its saved draft. Submission freezes
and validates the selected model, actual mode, parameters, prompt and participating images.
