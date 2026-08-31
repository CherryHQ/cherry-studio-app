# Composer

The app's input surface: a text field, the attachments staged under it, the ＋
menu that fills them, the model pill, and the send/stop button. Chat and
painting both mount it, which is why it lives here rather than inside either.

It is the *business* composer, built on top of the presentational `Composer` in
`@cherrystudio/ui`. The package knows nothing about attachments, models, or
sending; this module is where those live.

## Assembled by the caller

There is no all-in-one component. `ComposerSurface` is the root, and the parts
go inside it in whatever order the screen wants — ours alongside the
presentational ones from `@cherrystudio/ui`. Naming tells them apart:
`Composer.Thing` is the package's, `ComposerThing` is ours.

```tsx
<ComposerSurface onSend={…} onStop={…} streaming={…}>
  <Composer.Collapsible>{tag}</Composer.Collapsible>   {/* optional, caller's own */}
  <ComposerAttachments />
  <ComposerField />
  <Composer.Toolbar>
    <ComposerMenu>{extraRows}</ComposerMenu>
    <ComposerModelPill icon={…} label={…} onPress={…}>{badge}</ComposerModelPill>
    <Composer.Send />
  </Composer.Toolbar>
</ComposerSurface>
```

Before this, a single `ComposerCore` took the caller-specific pieces as slot
props (`accessory`, `menuItems`, `modelBadge`, `modelSettings`). Every new
consumer would have added another one. Assembling instead deleted all four,
plus `allowEmptySend` and `isSendEnabled` — see `canSend` below.

## Public Interface

- `ComposerSurface` — the root. Owns the send protocol (below); everything else
  is `children`.
  - `canSend` — omit for "there is text or there is an attachment". Pass a
    boolean when the screen has its own conditions, as painting does.
  - `getSendErrorLabel` — a message for a failure the caller recognises.
  - `dismissKeyboardOnSend` — for screens whose list dismisses it already.
- `ComposerField` — the text field, plus pasting images into attachments. It forwards the narrow
  presentation controls (`style`, `onFocus`, `onBlur`) so a screen can arrange resting and active
  states without replacing the native field or changing its editor mode.
- `ComposerAttachments` — the staged attachments, in a row that swells and
  shrinks with them.
- `ComposerMenu` — the ＋ menu. `children` are extra `Composer.Menu.Item`s
  appended below a separator.
- `ComposerModelPill` — the model button. Its `icon` is a composed `ModelPickerIcon`, and
  `children` trail the label inside the pill.
- `ComposerSessionProvider` / `useComposerState` / `useComposerActions` — one
  draft, its managed attachments, and the presentation transition for its
  input context.
- `useComposerPresentationActions` — presents a Sheet or native picker that
  replaces the live input context. The model pill and media menu already use
  it; caller-owned replacement buttons, such as painting settings, use the
  same action.
- `ComposerDock` — connects that input-context state to CherryUI's
  `Composer.Dock`. Chat keeps it in normal parent flow; floating surfaces can pair it with
  CherryUI's `useComposerDockLayout` measurement and content-inset primitive.
- `utils/composerAttachments` is deep-imported on purpose (see `index.ts`).

## What is deliberately *not* pluggable

Sending. Trim, clear before awaiting, restore the draft *and* the attachments if
it rejects, toast, log, and the un-animated keyboard dismissal — that is a
protocol, not a part, and two screens assembling it separately would be two
implementations of it. It lives in `ComposerSurface`, which is what renders the
surface, so there is no way to compose a composer that skips it. A synchronous
in-flight lock also prevents a repeated gesture from snapshotting and restoring
the same draft twice. Pasting is baked into `ComposerField` for the same reason.

The full checklist for it is the behaviour contract in
`src/frontend/features/chat/input/README.md` — that is the screen you actually
walk to verify it.

## Organization

- `components/ComposerSurface.tsx`: the root and the send protocol.
- `components/ComposerField.tsx`, `components/ComposerAttachments.tsx`,
  `components/ComposerModelPill.tsx`: the parts.
- `components/ComposerMenu.tsx`: the ＋ menu. Camera, photos and files hand off
  to the system pickers (`expo-image-picker`, `expo-document-picker`) rather
  than drawing anything in-app.
- `components/ComposerAttachmentStrip.tsx`: internal to `ComposerAttachments`;
  shows import progress, then delegates ready files to `FileEntryPreview`.
- `components/ComposerSessionProvider.tsx` and
  `hooks/useManagedComposerAttachments.ts`: own one composer session and import
  transient picker results into managed file entries before exposing them to
  Chat or Painting. Existing managed entries passed into a session are borrowed;
  removing them detaches them without deleting their source file. A successful
  send transfers a newly imported entry out of temporary Composer ownership;
  failed-send restoration restores that ownership with the draft. Unmounting a
  composer deletes any newly imported entries it still owns.
- `context/ComposerProvider.tsx`: the session's private draft, attachments, and
  field-ref contexts, plus the input-presentation transition. Its contexts are
  split so dispatch-only components and the dock skip keystroke re-renders.
- `components/ComposerDock.tsx`: pins or reconnects CherryUI's keyboard-tracking
  dock according to the current input context.
- `utils/composerAttachments.ts`: attachment drafts and the message parts they
  turn into, with tests.

## Behavior notes

- Input surfaces have two policies. An overlay (the ＋ menu or chat effort
  slider) preserves field focus and the live keyboard. A replacement (model or
  settings Sheet, camera, photo library, or file picker) first disables dock
  keyboard tracking, blurs the field, awaits keyboard dismissal, and leaves one
  render frame for the closed UI to become inert before presenting. The dock
  stays at its resting bottom position after the replacement closes; the next
  real field focus reconnects keyboard tracking. Success and cancellation use
  the same path.
- Transient attachments render their own progress tile while they are imported
  into managed storage. Any importing attachment disables send; text editing,
  removal, and tools remain available. The send boundary rechecks readiness and
  exposes only managed `fileEntryId` attachments to callers. Import timing logs
  contain only kind, size, result, and duration.
- The i18n keys are still under `chat.*`. Two of them (`chat.media.camera`,
  `chat.media.photos`) are shared with the settings screens, so a `composer.*`
  namespace would fork strings rather than move them.
