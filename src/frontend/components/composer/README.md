# Composer

The app's input surface: a text field, the attachments staged under it, the ＋
menu that fills them, the model pill, and the send/stop button. Chat and
painting both mount it, which is why it lives here rather than inside either.

It is the *business* composer, built on top of the presentational `Composer`
in `@cherrystudio/ui`. The package knows nothing about attachments, models, or
sending; this module is where those live.

## Public Interface

- `ComposerCore` — the composed input. Fully driven by `ComposerProvider` for
  the draft and attachments; everything else is props.
- `ComposerProvider` / `useComposerState` / `useComposerActions` — the draft and
  its attachments. (`useComposerMeta`, which carries the field's ref, is
  internal: nothing outside the module has needed the field itself.)
- `ComposerDock` — floats a composer at the bottom of a screen: pinned over the
  content, inset from the edges, riding the keyboard, reporting its height.
- `useComposerDockLayout` — the other half of the dock: what the list above it
  reserves, and the per-frame height a floating button rides.
- `utils/composerAttachments` and `utils/composerLayout` are deep-imported on
  purpose (see `index.ts`).

## The three slots

`ComposerCore` deliberately models nothing caller-specific. What only one
caller needs arrives as a `ReactNode`:

| Slot | Where it renders | Chat passes | Painting passes |
| --- | --- | --- | --- |
| `accessory` | a collapsible row above the attachments | the selected-tool tag | — |
| `menuItems` | the ＋ menu, under a separator | web search / create image | — |
| `modelBadge` | inside the model pill, after the label | the reasoning-effort label | — |

The test for adding a fourth: *would painting say it too? would a third input
surface?* If not, it is a slot, not a prop. This is the same rule that keeps
`reasoningEffort` and `selectedTool` out of the `@cherrystudio/ui` package —
applied one layer up.

## Organization

- `components/ComposerCore.tsx`: the composition, async send with draft +
  attachment recovery, and the model pill.
- `components/ComposerMenu.tsx`: the ＋ menu. Camera, photos and files hand off
  to the system pickers (`expo-image-picker`, `expo-document-picker`) rather
  than drawing anything in-app.
- `components/ComposerAttachmentStrip.tsx`: the staged attachments, on
  `@/frontend/components/mediaTile`.
- `components/ComposerDock.tsx` + `hooks/useComposerDockLayout.ts`: the docking
  geometry, split because one half is per-frame and the other is not.
- `context/ComposerProvider.tsx`: draft, attachments, field ref — split into
  three contexts so dispatch-only components skip keystroke re-renders.
- `utils/composerAttachments.ts`: attachment drafts and the message parts they
  turn into, with tests.
- `utils/composerLayout.ts`: the shared geometry constants.

## Behavior notes

- Sending clears the draft optimistically and restores it — with the
  attachments — if `onSendPress` rejects, alongside a danger toast. A caller
  that wants its own message for a known failure returns one from
  `getSendErrorLabel`.
- The ＋ menu takes the keyboard down but leaves the field first responder, so
  iOS restores the keyboard the instant the menu closes. Everything else that
  opens over the input (model picker, settings) blurs it first.
- The i18n keys are still under `chat.*`. Two of them (`chat.media.camera`,
  `chat.media.photos`) are shared with the settings screens, so a `composer.*`
  namespace would fork strings rather than move them.
