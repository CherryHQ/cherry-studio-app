# Chat Input Behavior

This directory owns the floating chat input at the bottom of chat workspaces. `ChatInput` is exported
through `index.ts` and takes only routing identity (`topicId`, plus `assistantId` for a topic that
does not exist yet).

It is built in three layers, and this document is the checklist for all three, because the user meets
them as one input:

1. `Composer` in `@cherrystudio/ui` — the surface, the field, the toolbar, the collapsing rows, the
   ＋ menu's morph. Knows nothing about the app.
2. `@/frontend/components/composer` — attachments, the pickers, the model pill, async send with
   recovery. Shared with painting, so it knows nothing about assistants either.
3. This directory — assistants, models, reasoning effort, web search. It assembles the composer's
   parts itself (see `ChatInput.tsx`) and drops its own nodes in: the tool tag as a
   `Composer.Collapsible`, the tools as `ComposerMenu` children, the effort label inside
   `ComposerModelPill`.

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
- [ ] Sendability defaults to "there is text or an attachment". A caller that passes `canSend`
      replaces that outright — painting does, because a promptless image model can send
      `{ attachments: [], text: '' }`.
- [ ] While streaming the send control becomes stop (`chat.input.action.stopGenerating`). It does not
      exist when not streaming.

### Paste

- [ ] Pasting images adds them as attachments and leaves the draft untouched.
- [ ] The attachment's name is URL-decoded from the pasted URI: `file:///tmp/Pasted%20Sticker.GIF`
      shows as `Pasted Sticker.GIF`.

### Keyboard before overlays

- [ ] Opening the model picker dismisses the keyboard, blurs the field, and clears the focused state
      **before** the picker opens.
- [ ] The image-settings button (painting only) does the same. It is assembled by painting rather
      than by the composer, so it calls `useComposerFieldDismiss()` explicitly — the one thing
      assembling made the caller's job.
- [ ] Opening the ＋ menu dismisses the keyboard but does **not** blur the field. The panel grows
      upward into the space the keyboard occupies, so the keyboard has to go; leaving the field as
      first responder is what makes iOS restore it the instant the menu closes.

### The model pill

- [ ] Shows the selected model's name; with no model, a `chat.model.select` pill.
- [ ] The icon falls back to the label's first character uppercased, or `M`.
- [ ] The reasoning-effort label appears only when the model has reasoning stops.
- [ ] The effort label is muted (`text-foreground`) at every stop except `max`, which is
      `text-brand` — Cherry's Logo red, deliberately not `text-primary`, which the theme setting
      recolours.

### The selected-tool row

- [ ] A selected tool shows above the field as a tag carrying the tool's localized short title.
- [ ] The tag can be cleared from the tag itself, without opening the ＋ menu.

### The ＋ menu

The panel grows out of the ＋ button itself, up and to the right, and is measured from its own
rows. It is a menu and nothing else: every row closes it and hands off to a system picker.

- [ ] The rows are camera, photos, file, then — behind a separator — the tools. All of them close the
      menu on tap.
- [ ] The tools appear only for a caller that puts them in the menu's `children`. Painting does not:
      web search and "create image" are chat concepts, and nothing in the menu can act on one
      without a caller to persist it.
- [ ] Camera and photos go through `expo-image-picker`; file goes through `expo-document-picker`.
      None of them is drawn here — see "Deliberately dropped".
- [ ] Each picker asks for its own permission first and does nothing if refused. Limited photo
      access needs no special handling: the picker runs out of process and returns what was chosen
      in it, whether or not the app can see the rest of the library.
- [ ] The photo picker takes at most `COMPOSER_PHOTO_SELECTION_LIMIT` (9) images, in the order
      they were selected.
- [ ] Cancelling any picker adds nothing and leaves the menu closed.
- [ ] A picker that fails to launch is logged. The menu has already closed by then, so without the
      log the gesture just looks ignored.
- [ ] Choosing a tool toggles it and closes the menu.

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
- [ ] A chosen effort belongs to the assistant it was chosen on: switching assistant, or switching to
      a model with no reasoning stops, drops it back to the assistant's own value.

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
  no detents, no pan-down close, and no "restore the default detent on return".
- **The self-drawn camera and photo grid.** A viewfinder with its own shutter, a paged photo grid
  with its own multi-select and permission states, and the library reader behind them are all gone;
  the system pickers do it. What that removed is worth naming, because it is what a self-drawn one
  costs: limited-access handling, foreground refresh, selection badges and their cap, a bitmap-stretch
  constraint on how far the panel could morph, and `expo-camera` itself.
  `loadPhotoPreviewPage` survives in `paintings/utils/photoLibrary.ts`, because the drawing list
  shows recent photos inline and no picker will do that.
- **`ReduceMotion.Never`.** The old motion config opted every animation out of the system setting.
  Reduced motion is now respected, via `Composer`'s own motion.

## Known defects, not fixed here

- `useChatInputReasoningEfforts` derives the available effort stops from
  `modelSettings.selections.default`, while the pill shows the model bound to the assistant. For an
  assistant on a non-default model the stops and the label come from two different models.
- The web-search mirror in `ChatInput.tsx` is the repository's only
  `react-hooks/set-state-in-effect` suppression. The rule is right that most such effects are
  derivable — the reasoning effort next to it was — but this one reconciles an optimistic write
  against the query it is racing, which cannot be read off render state. Untangling it needs tests
  it does not have.

## Ownership

- `@/frontend/components/composer` owns the draft, the attachments, the pickers, the send, and the
  docking geometry. Whether the ＋ panel is open is `Composer.Menu`'s, not anyone else's.
- `ChatInput.tsx` owns the selected tool, the reasoning effort, everything that talks to assistants
  and models, **and the arrangement** — it assembles the composer's parts rather than configuring a
  single component.
- `effortSlider/` owns the reasoning-effort control, which lives in the model picker's footer — not
  in the input.
- Leaf components here render from what they are passed. They must not keep parallel state for
  something `ChatInput.tsx` already holds.

## Manual acceptance with agent-device

Use the existing Expo dev server on port `8001`.

```bash
agent-device open com.cherry-ai.cherry-studio-app --session chat-input --platform ios --device "iPhone 17 Pro" --relaunch
```

Then walk the contract above. The four items under "Not covered by tests" are mandatory; the rest are
worth a pass whenever this directory changes shape.
