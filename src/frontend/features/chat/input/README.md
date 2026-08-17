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
   parts itself (see `ChatInput.tsx`) and drops its own nodes in: the tools as `ComposerMenu`
   children, and the effort gauge/slider overlay above the live surface.

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

### The field

- [ ] The field is `EnrichedMarkdownTextInput`, not RN's `TextInput`, and it is **uncontrolled**: it
      owns its buffer, reports changes out, and only accepts a value pushed in when that value
      differs from what it last reported. Round-tripping every keystroke would fight it for the caret.
- [ ] `value` / `onChangeText` therefore carry **Markdown**, not the glyphs on screen. That is what
      lets a tool mention survive leaving the field — its identity is a URL, and plain text has
      nowhere to keep one.
- [ ] Nothing parses what the user **types**. The input only applies styles it is told to apply and
      the serializer only writes delimiters around ranges that were actually styled, so typed
      `**stars**` arrive as `**stars**`.
- [ ] Pasted text **is** parsed, and this is not configurable — iOS routes `paste:` straight into
      the library's `pasteMarkdown:`. So pasting `**stars**` yields bold *stars* and the message
      loses the asterisks, while typing the same characters keeps them. Verified on device; if it
      ever needs to stop, the fix is upstream, not here.
- [ ] Auto-link detection is off (`linkRegex={null}`), and the selection menu's Format submenu and
      "Copy as Markdown" are both disabled. A mention is the only entity this field can hold, and it
      is the only one the rest of the app can render.
- [ ] Adding to what the user wrote goes through `useComposerMeta().inputRef`, never `setDraft`.
      `setDraft` replaces the whole buffer and is for send and send-failure only.
- [ ] **Accessibility regression, iOS only.** The field is one VoiceOver element reading its whole
      text, and is *not* announced with the native "text field" role — the library says so in its
      own `docs/ACCESSIBILITY.md`, because exposing the inner `UITextView` is unreliable under its
      TextKit stack. Android keeps a real `EditText`. The visible symptom for us is that XCUITest
      cannot find a field to type into, so `agent-device type` / `fill` no longer reach the
      composer; drive it with the simulator's hardware keyboard instead.

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
- [ ] Opening the reasoning-effort slider keeps the field focused and leaves the keyboard in place.
      The app content is blurred behind a portal; iOS also blurs the keyboard through
      `OverKeyboardView`, while Android dims it. The first background or keyboard tap closes only
      the slider, so the next tap can continue typing immediately.
- [ ] The image-settings button (painting only) does the same. It is assembled by painting rather
      than by the composer, so it calls `useComposerFieldDismiss()` explicitly — the one thing
      assembling made the caller's job.
- [ ] Opening the ＋ menu dismisses the keyboard but does **not** blur the field. The panel grows
      upward into the space the keyboard occupies, so the keyboard has to go; leaving the field as
      first responder is what makes iOS restore it the instant the menu closes.

### Model and reasoning controls

- [ ] Shows the selected model's name; with no model, a `chat.model.select` pill.
- [ ] The icon falls back to the label's first character uppercased, or `M`.
- [ ] A gauge appears immediately left of send only when the selected model has reasoning stops. Its
      needle rotates across the same normalized stop positions as the slider.
- [ ] The model pill has no effort suffix, and the model picker has no effort footer: the gauge is the
      only entry point.
- [ ] Tapping the gauge grows the discrete slider from the gauge into a viewport-centered panel.
      Its label and track stay centered when the keyboard moves the composer. The composer keeps
      its size and stays mounted behind the blur, so the draft, attachments, selected tool,
      keyboard, and focus remain unchanged.
- [ ] The floating label contains the selected model name and localized effort name; crossing a stop
      updates it immediately and fires the slider's selection haptic.
- [ ] Tapping outside closes the slider. The transparent dismissal regions do not cover its track,
      so tap-to-seek and dragging remain available.

### Tools

The two tools do not share a control, because they do not share a lifetime. Web search is a setting
on the assistant that outlives the message being written; a mention applies to that message only.
Everything below follows from that split.

- [ ] Web search is a switch in the ＋ menu, reading and writing `assistant.settings.enableWebSearch`.
      There is no separate composer state for it.
- [ ] The switch is the **only** place its state is shown. There is deliberately no tag above the
      field: the switch reads its own state whenever the menu is open, and a second indicator for
      one setting was not worth a permanent row above the field. The cost is real — with the menu
      closed nothing says the next message will search.
- [ ] A mention tool has no selected state anywhere. Choosing it inserts a Markdown link —
      `[<localized name>](tool://<id>)` — at the caret, and the draft text is the only record that
      the message asked for it.
- [ ] Neither the field nor the sent message shows the link syntax: both render the name alone, in
      the brand color. The `@` the first version used is gone.
- [ ] The field treats the mention as one thing — the caret will not sit inside it, and one
      backspace removes the whole mention. That is the underlying input's own behavior for links,
      not something this directory implements.
- [ ] A mention can only be inserted, never typed. Prose that happens to contain the tool's name is
      ordinary text, and `splitToolMentions` (`@/frontend/utils/toolMentions`) leaves it alone.
- [ ] The tool id lives in the URL, so a message keeps meaning the same tool after the app's
      language changes. The name in the link text is a snapshot of what the sender saw.
- [ ] A link to an id this build does not know, and any ordinary link, stay plain text.

### The ＋ menu

The panel grows out of the ＋ button itself, up and to the right, and is measured from its own
rows. It is a menu and nothing else: every row is one decision and closes it.

- [ ] The rows are camera, photos, file, then — behind a separator — the tools.
- [ ] Every row closes the menu on tap, including `Composer.Menu.Toggle`. A switch row that stayed
      put would read as a different kind of control than the ones above it.
- [ ] The panel is at least 60% of the screen wide, so a translated label still fits beside a
      trailing control. Content wider than that drives the panel instead.
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
- [ ] Choosing a mention tool appends its name to the draft and closes the menu.

### Assistant, model, and web search

*Covered by `useChatInputWebSearchToggle.test.tsx`, except the model reconcile.*

- [ ] The assistant record is the source of truth. `useChatInputWebSearchToggle` holds the user's
      flip only until the persisted value catches up, and retires it **during render** — a value
      mirrored in through an effect is stale for exactly as long as the query takes to catch up,
      which is what made the previous version of this the repository's only
      `react-hooks/set-state-in-effect` suppression.
- [ ] Switching assistant drops an un-landed flip; the switch reads the new assistant's setting.
- [ ] With no assistant, flipping the switch does nothing and writes nothing.
- [ ] Writes are **serialised**: a flip during an in-flight write updates that write's target rather
      than queueing a second one, so a burst of taps settles on the last one.
- [ ] If a write fails and no newer target arrived meanwhile, the switch rolls back to the
      assistant's persisted value and the failure is logged.
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
2. Pasting an **image** into the field. `expo-paste-input`'s wrapper now wraps a rich text input
   rather than RN's `TextInput`, and nothing in Jest reaches that seam. Text paste is verified and
   works; `xcrun simctl pbcopy` only carries text, so the image half has no simulator route either.
3. Switching assistants and watching the web-search switch follow the new assistant.
4. Switching models on an assistant whose effort the new model does not support.
5. Flipping the web search switch, reopening the menu, and confirming it stayed where it was put.
6. Choosing a mention tool with a draft already typed, then sending, and reading the highlight back
   in the sent message.
7. Backspacing a mention away in one press, and failing to put the caret inside it. Jest's stand-in
   for the field is a plain `TextInput`, so neither is reachable there.
8. The field's height: one line when empty, growing to the 132pt cap, scrolling past it.

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

## Ownership

- `@/frontend/components/composer` owns the draft, the attachments, the pickers, the send, and the
  docking geometry. Whether the ＋ panel is open is `Composer.Menu`'s, not anyone else's.
- `ChatInput.tsx` owns the web search switch, the reasoning effort, everything that talks to
  assistants and models, **and the arrangement** — it assembles the composer's parts rather than
  configuring a single component.
- `@/frontend/utils/toolMentions` owns what a mention is and how to find one in text. It is shared
  rather than owned here because the message list highlights mentions it never wrote.
- `effortSlider/` owns the reusable track and gesture math. `ChatInputEffortOverlay` owns its
  composer-specific morph, dismissal regions, and floating label.
- Leaf components here render from what they are passed. They must not keep parallel state for
  something `ChatInput.tsx` already holds.

## Manual acceptance with agent-device

Provision the workspace simulator, Metro port, and agent-device session through
[Parallel Device Testing](../../../../../docs/guides/parallel-device-testing.md).

Then walk the contract above. The items under "Not covered by tests" are mandatory; the rest are
worth a pass whenever this directory changes shape.

**agent-device cannot type into this field.** `type` and `fill` both resolve an XCUITest text-field
element, and the field does not expose one (see the accessibility note above); `type` fails with
`XCTEST_RECORDED_FAILURE` and restarts the runner, which sends the app to the home screen — it looks
like a crash and is not one. Everything else (taps, snapshots, screenshots) works normally, so drive
the ＋ menu with agent-device and type through the simulator's own keyboard:

```
osascript -e 'tell application "Simulator" to activate' \
  -e 'tell application "System Events" to tell process "Simulator" to keystroke "draw a cat"'
# backspace is key code 51
```
