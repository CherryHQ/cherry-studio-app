# Drawings and image-editing runbook

Status: draft. Agent-readable steps, not recorded automation; no device validation.
[Cases](../cases.json) own the actions, inputs and expected outcomes.

## Inputs and transient state

Use the caller-selected generation/editing models, reference photo if needed, editable static image
and local save destination. Keep run-created board/version identities and the model-call allowance.
A model supporting generation is not automatically capable of reference-image editing.

## Board and template paths

- For `drawings.create`, send from the gallery composer. The first generation creates the board;
  do not invent a separate required creation button.
- For `drawings.template-browse`, inspect the template stage, category filtering and template
  switching. Its dismissal may use a gesture or platform back rather than a close button.
- For `drawings.template-generate`, fill the selected template's actual fields and use the
  approved photo only when required. The resulting generation opens its board.

## Canvas, edits and generation controls

- Use `drawings.canvas` and `drawings.image-focus` to navigate between the overview and image.
  In the documented product behavior, tapping a node selects it and tapping the selected node
  opens focus; use the current UI observation to confirm the state.
- In `drawings.reference-edit`, confirm the intended image is attached as a reference before
  sending. In `drawings.positional-edit`, long-press the intended image position to add a note
  in image focus (observed on iOS), and inspect the selected
  instruction before generation. A note is an instruction, not a pixel mask.
- For `drawings.model`, `drawings.ratio` and `drawings.count`, use only settings exposed
  by the selected model. One generation can support these checks if each selection and resulting
  outcome is observed separately. Do not repeat generation just to obtain prettier output.
- `drawings.stop` may discard the active receipt. For `drawings.restart`, the next send
  may create another board if none of the previous generations survived; this is expected behavior.
- `drawings.retry` needs a real failed receipt with a retry action. Without one, record
  incomplete rather than introducing faults or manufacturing a passing receipt.

## Board maintenance and local editing

Run `drawings.rename`, `drawings.reopen` and `drawings.info` while the board exists.
For `drawings.delete-version`, choose a run-created disposable version and retain another image.
Keep a board for `common.relaunch-board`. For `drawings.save`, inspect the actual destination
after saving instead of relying only on a toast.

`drawings.crop`, `drawings.rotate` and `drawings.cancel-edit` exercise the local image editor,
separately from AI edits. Use a static JPEG, PNG or WebP. Saving in the library creates an edited
version; saving in the composer replaces that draft attachment. Preserve the original source.
The library's current-version pointer changes even though the original file is retained. Use a
run-created disposable copy unless a proven UI restoration path exists; retaining the original
bytes alone does not restore the library's prior visible state.
GIF and vector preview support does not imply local editing support.

## Evidence and capture

Use screenshots for canvas/focus and edited-image observations when available. Capture stable
navigation separately from gesture coordinates, variable image layouts and generated outputs.
Record platform and device class when later verifying a gesture script.
