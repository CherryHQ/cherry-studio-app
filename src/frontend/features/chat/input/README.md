# Chat Input Behavior

This directory owns the floating chat input at the bottom of chat workspaces. `ChatInput` is exported
through `index.ts` and takes only routing identity (`topicId`, plus `assistantId` for a topic that
does not exist yet). Callers should not reach into the internal provider or leaf components.

The shell — surface, field, toolbar, collapsing rows, the ＋ menu — comes from `Composer` in
`@cherrystudio/ui`. What lives here is everything the package must not know about: assistants,
models, reasoning effort, web search, photo permissions.

## Why this document exists

The behaviour below used to be pinned by `ChatInputSurface.test.tsx` and `ChatInputActionSheet.test.tsx`.
Those suites were coupled to a component structure that no longer exists, and were deleted rather
than rewritten against a shape that is still moving. This file is the replacement safety net, so it
has to be read to be worth anything.

Two consequences to take seriously:

- **A contract rots.** The version of this file before the `Composer` migration claimed the sheet had
  `50%`/`70%` snap points (the code said `[0, 50%, 100%]`), that choosing a tool cleared selected
  photos (it never did), and that the selected-photo action was a no-op (it had been wired for some
  time). Every one of those was wrong the day it was read. If you change behaviour here, change this
  file in the same commit or it will lie to the next person too.
- **Everything under "Not covered by tests" is load-bearing and unguarded.** Those are the items to
  walk on device before shipping anything in this directory.

## Contract

### Sending

- [ ] `onSendPress` receives `{ attachments, text }` with `text` **trimmed**. The draft in state is
      not trimmed — only what is sent.
- [ ] The draft and attachments clear **before** the send is awaited, so the field is empty
      immediately.
- [ ] If the send rejects: the draft is restored **verbatim, untrimmed**, the attachments are
      restored, a `danger` toast shows `chat.input.sendFailed`, and the error is logged. The toast is
      deliberately vague, so without the log a failed send leaves no trace to debug from.
- [ ] `getSendErrorLabel(error)` overrides the toast label for errors the caller recognises; returning
      `undefined` falls back to the default. Painting uses this for validation errors.
- [ ] Sending calls `KeyboardController.dismiss({ animated: false })` by default. Not animated: an
      animated dismissal races the message list's scroll-to-bottom.
- [ ] `dismissKeyboardOnSend={false}` suppresses that call entirely, for screens where the message
      list dismisses the keyboard itself.
- [ ] Sendability is `isSendEnabled && (allowEmptySend || there is text or an attachment)`.
- [ ] `allowEmptySend` sends `{ attachments: [], text: '' }` — a painting prompt can be empty.
- [ ] While streaming the send control becomes stop (`chat.input.action.stopGenerating`). It does not
      exist when not streaming.

### Paste

- [ ] Pasting images adds them as attachments and leaves the draft untouched.
- [ ] The attachment's name is URL-decoded from the pasted URI: `file:///tmp/Pasted%20Sticker.GIF`
      shows as `Pasted Sticker.GIF`.

### Keyboard before overlays

- [ ] Opening the model picker dismisses the keyboard, blurs the field, and clears the focused state
      **before** the picker opens.
- [ ] The model-settings button (painting only) does the same.
- [ ] Opening the ＋ menu does **not** manually blur. iOS restores first responder when an overlay
      dismisses, and a manual blur is what breaks the instant refocus on close.

### The model pill

- [ ] Shows the selected model's name; with no model, a `chat.model.select` pill.
- [ ] The icon falls back to the label's first character uppercased, or `M`.
- [ ] The reasoning-effort label appears only when the model has reasoning stops.
- [ ] The effort label is muted (`text-default-foreground`) at every stop except `max`, which uses
      `thinkingAccentColor`.

### The selected-tool row

- [ ] A selected tool shows above the field as a tag carrying the tool's localized short title.
- [ ] The tag can be cleared from the tag itself, without opening the ＋ menu.

### The ＋ menu

- [ ] Photo permissions and previews load **only while the menu is open**, and refresh when the app
      returns to the foreground while it is open.
- [ ] A permissions failure is treated as no photo access, clearing previews and any selection.
- [ ] Tapping a photo toggles it. Badges show one-based selection order, in the order selected.
- [ ] At most `CHAT_INPUT_PHOTO_SELECTION_LIMIT` (9) photos can be selected at once.
- [ ] Confirming adds the selected photos as attachments; a failure surfaces an error rather than
      failing silently, and a second tap while one is in flight is ignored.
- [ ] Backing out of the photo grid clears the selection and returns the panel to its default size.
- [ ] Closing the menu clears the selection.
- [ ] Choosing a tool toggles it and closes the menu. It does **not** touch the photo selection.
- [ ] Cancelling the file picker changes nothing; picking files adds them and closes the menu.
- [ ] Capturing a photo adds it and closes the menu.
- [ ] Media controls are not driven by the panel's per-frame position — they are laid out by flex, so
      dragging the panel does not re-measure them every frame.

### Assistant, model, and web search

*None of this has test coverage. See below.*

- [ ] Switching assistant resets the selected tool to `web-search` if and only if that assistant has
      `settings.enableWebSearch`.
- [ ] With no assistant, a selected `web-search` tool is cleared and any pending write is dropped.
- [ ] Toggling web search persists to the assistant through a **serialised** write loop: a toggle
      during an in-flight write updates the pending target rather than queueing a second write.
- [ ] If the write fails and no newer target arrived meanwhile, the selected tool rolls back to the
      assistant's persisted value and the failure is logged.
- [ ] While a write is pending, the assistant-sync effect must not fight it: it defers until the
      persisted value agrees with the pending target.
- [ ] Picking a different model for an assistant writes `modelId` **and** reconciles
      `reasoning_effort` and web search for the new model, in one patch
      (`reconcileReasoningEffortForModel` / `reconcileWebSearchForModel`).
- [ ] Picking the same model writes nothing.
- [ ] With no assistant, picking a model goes through `getNextModelSelection` and updates the global
      `default` selection instead.
- [ ] Choosing a reasoning effort updates local state immediately and persists to the assistant; a
      failed write is logged and nothing is rolled back.

## Not covered by tests

Walk these on device before shipping. They are the ones with no net at all:

1. Send failure recovery — send with the network off and confirm the draft, the attachments, and the
   toast.
2. Pasting an image into the field.
3. Switching assistants and watching the web-search tag follow the new assistant's setting.
4. Switching models on an assistant whose effort the new model does not support.

## Deliberately dropped

Do not restore these; their absence is the design, not a regression.

- **Grow-on-focus.** The surface used to rest 28px narrower and spring to full width on focus. It was
  the only reason for the three-layer stack, the frozen content-column width, the send button's
  `pr-16` compensation, and `isComposerExpanded`. All of it went with it.
- **The focus-me placeholder.** Tapping send with nothing to send used to focus the field, because
  there was a collapsed state to expand. With no collapsed state the gesture means nothing, so send
  is simply disabled.
- **The bottom sheet.** The ＋ menu is inline now, growing out of the button. There is no sheet, so
  no detents and no pan-down close — backing out of the photo grid is the way back.
- **`ReduceMotion.Never`.** The old motion config opted every animation out of the system setting.
  Reduced motion is now respected, via `Composer`'s own motion.

## Known defect, not fixed here

`useChatInputReasoningEfforts` derives the available effort stops from
`modelSettings.selections.default`, while the pill shows the model bound to the assistant. For an
assistant on a non-default model the stops and the label come from two different models.

## Ownership

- `ChatInputProvider` owns draft text, attachments, focus state, menu open state, selected tool, and
  the field ref.
- `useChatInputPhotoPicker` owns photo permissions, preview loading, and photo selection.
- `effortSlider/` owns the reasoning-effort control, which lives in the model picker's footer — not
  in the input.
- `ChatInput.tsx` owns everything that talks to assistants and models.
- Leaf components render from provider state and call provider actions. They must not keep parallel
  state for the same thing.

## Manual acceptance with agent-device

Use the existing Expo dev server on port `8001`.

```bash
agent-device open com.cherry-ai.cherry-studio-app --session chat-input --platform ios --device "iPhone 17 Pro" --relaunch
```

Then walk the contract above. The four items under "Not covered by tests" are mandatory; the rest are
worth a pass whenever this directory changes shape.
