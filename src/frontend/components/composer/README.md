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
- `ComposerField` — the text field, plus pasting images into attachments.
- `ComposerAttachments` — the staged attachments, in a row that swells and
  shrinks with them.
- `ComposerMenu` — the ＋ menu. `children` are extra `Composer.Menu.Item`s
  appended below a separator.
- `ComposerModelPill` — the model button. `children` trail the label inside the
  pill.
- `ComposerProvider` / `useComposerState` / `useComposerActions` — the draft and
  its attachments.
- `useComposerFieldDismiss` — take the keyboard down and blur, before opening
  anything over the composer. The pill does this itself; a toolbar button the
  caller adds has to call it.
- `ComposerDock` / `useComposerDockLayout` — floating the composer at the bottom
  of a screen, and what the content above it reserves.
- `utils/composerAttachments` and `utils/composerLayout` are deep-imported on
  purpose (see `index.ts`).

## What is deliberately *not* pluggable

Sending. Trim, clear before awaiting, restore the draft *and* the attachments if
it rejects, toast, log, and the un-animated keyboard dismissal — that is a
protocol, not a part, and two screens assembling it separately would be two
implementations of it. It lives in `ComposerSurface`, which is what renders the
surface, so there is no way to compose a composer that skips it. Pasting is
baked into `ComposerField` for the same reason.

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
- `components/ComposerAttachmentStrip.tsx`: internal to `ComposerAttachments`,
  on `@/frontend/components/mediaTile`.
- `components/ComposerDock.tsx` + `hooks/useComposerDockLayout.ts`: the docking
  geometry, split because one half is per-frame and the other is not.
- `context/ComposerProvider.tsx`: draft, attachments, field ref — split into
  three contexts so dispatch-only components skip keystroke re-renders.
- `utils/composerAttachments.ts`: attachment drafts and the message parts they
  turn into, with tests.
- `utils/composerLayout.ts`: the shared geometry constants.

## Behavior notes

- The ＋ menu takes the keyboard down but leaves the field first responder, so
  iOS restores the keyboard the instant the menu closes. Everything else that
  opens over the input blurs it first, via `useComposerFieldDismiss`.
- The i18n keys are still under `chat.*`. Two of them (`chat.media.camera`,
  `chat.media.photos`) are shared with the settings screens, so a `composer.*`
  namespace would fork strings rather than move them.
