# Composer

The app's input surface: a text field, the attachments staged under it, the ＋
menu that fills them, the model pill, and the send/stop button. Chat and
painting both mount it, which is why it lives here rather than inside either.

It is the *business* composer, built on top of the presentational `Composer` in
`@cherrystudio/ui`. The package knows nothing about attachments, models, or
sending; this module is where those live.

The `ComposerDraft` sub-entry exposes the in-memory editor buffer to local chat. Both the mounted
editor and outstanding file imports or sends update the same buffer when its conversation reopens.

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
  - `allowFollowUp` — lets local chat queue messages during a reply. The button follows the
    rendered draft, while keyboard submission uses the text captured by the native editor.
  - `getSendErrorLabel` — a message for a failure the caller recognises.
  - `dismissKeyboardOnSend` — defaults to blurring the input, ending editing, and dismissing the
    keyboard with its native transition when submitting. The dock follows that transition, just
    as it follows keyboard opening, then detaches when closing finishes. If the keyboard is
    already hidden, it detaches immediately. A keyboard opening for this field reconnects it. Chat enables
    this behavior; its list does not dismiss the keyboard again.
- `useComposerSubmit` — returns a guarded entry to that same send protocol for field Return
  submission with the native Markdown snapshot. It respects sendability and pending submissions, and never invokes Stop. Chat admits
  drafted follow-ups through the ordinary queue path while the current answer streams.
- `ComposerField` — the text field, plus pasting images into attachments. Focus registers the field for explicit blur. It forwards `layout`, `style`, `onLayout`, `onFocus`, and `onBlur`; native blur alone does not
  end editing, since a composer control may be taking over the interaction.
  It also forwards `submitOnReturn` and `onReturnSubmit`; `ComposerEditor` exposes the same props.
  When Return submits, it supplies the translated native-menu newline label. The action inserts
  after the selection, preserving selected words; it adds no toolbar button.
  Plugin and Skill references use the link color and stay inline at the field's font size. The
  native formatter marks their text range with the `com.cherryai.composer-mention-icon` attribute;
  the paste wrapper excludes marked ranges from media extraction while continuing to import real
  pasted images. The marker is cleared with link formatting during deletion and undo. It cannot live
  in `NSTextAttachment.fileType`, which UIKit invalidates when assigning an image.
  Skill artwork follows desktop's Lucide ToolCase. Only the editor's raster-only inline attachment
  API uses encoded PNG bytes; normal controls use the vector icon.
  Quote references use paired quotation marks without an inline image. `onLinkPress` reports the
  link URL and measured window-space bounds; the feature owns its text preview. Native editor
  updates require the development client described in the development guide.
- `ComposerAttachments` — the staged attachments, in a row that swells and
  shrinks with them. Ready still images open the shared preview with optional image editing.
  Saving replaces the matching attachment in place; cancellation, failure and a removed/stale
  source preserve the current draft. The source library file remains unchanged.
- `ComposerMenu` — the ＋ menu. `children` are extra `Composer.Menu.Item`s
  appended below a separator. `onPickFiles` can replace the files destination;
  the menu still settles input dismissal before calling it.
- `useComposerDocumentPicker` — composes the app-wide file-upload picker with
  the shared input-replacement action and stages the chosen files as library uploads.
- `ComposerModelPill` — the model button. Its `icon` is a composed `ModelPickerIcon`, and
  `children` trail the label inside the pill.
- `ComposerSessionProvider` / `useComposerState` / `useComposerActions` — one
  draft, its managed attachments, and the presentation transition for its
  input context. Field changes go through `editDraft`; `subscribeDraftEdits` announces user edits
  and accepted sends synchronously so operations such as dictation release ownership before the
  text changes. `setDraft` remains for owned updates such as live dictation and send recovery.
- `useComposerPresentationState` exposes the native keyboard target for the registered field.
  `keyboardVisible` drives the chat frame on the UI thread and `isEditing` mirrors it for controls
  and accessibility. `keyboardTracking` lasts through the closing animation.
- `useComposerPresentationActions` registers the field and its blur handle. The send button and
  background area can dismiss it once. A replacement action blurs the field, awaits keyboard
  dismissal and presents the model, settings or media picker.
- `ComposerEditor` and `ComposerEditorAccessories` connect the shared frame and large-editor
  controls to the app field and translated labels. Chat uses its own software keyboard for the
  ordinary one-row/two-row transition. The painting workspace opts into retained editing and can
  also expand for draft text. Its compact reference preview and the attachment strip are separate.
- `ComposerDock` — connects that input-context state to CherryUI's
  `Composer.Dock`. Chat uses `expandable-overlay`: the message list reserves the dock's measured
  height as a native content inset, leaving its viewport fixed through keyboard and editor motion.
  Painting uses `expandable`, with a compact-height flow placeholder. Both keep the same dock
  mounted during manual expansion.
  Other floating surfaces can use CherryUI's `useComposerDockLayout` inset primitive.
- `ComposerDismissArea` — ends editing on a completed, unhandled background press. Scrolling and
  child controls cancel the press inside CherryUI's native `BackgroundPressArea`, including a touch
  that stops momentum. Message text still dismisses; message controls and the scroll-to-bottom
  button use `BackgroundPressExclusion`. Recognition is disabled outside editing, and repeated
  dismissal cannot blur the same editing session twice.
  Nested message lists use `keyboardShouldPersistTaps="always"` so this boundary owns dismissal for
  both chat and painting. Native boundary changes require a development-client rebuild.
- `utils/composerAttachments` is deep-imported on purpose (see `index.ts`).

## What is deliberately *not* pluggable

Sending. Trim, clear before awaiting, restore the draft *and* the attachments if
it rejects, explain the outcome, log, and dismiss the input with its native keyboard transition — that is a
protocol, not a part, and two screens assembling it separately would be two
implementations of it. It lives in `ComposerSurface`, which is what renders the
surface, so there is no way to compose a composer that skips it. A synchronous
in-flight lock belongs to the composer session, so changing input presentations cannot
start another send or clear a newer draft while the first is pending. `useComposerState().isSubmitting`
covers preparation, admission, and failure recovery; it does not wait for background generation.
Failure restoration also retains text and attachments added while the send was pending. A rejection named `AbortError` is a send the user stopped: the draft is restored without a failure notice. Pasting is baked into `ComposerField` for the same reason.

The full checklist for it is the behaviour contract in
`src/frontend/features/chat/components/ChatInput/README.md` — that is the screen you actually
walk to verify it.

## Organization

- `components/ComposerSurface.tsx`: the root and the send protocol.
- `components/ComposerField.tsx`, `components/ComposerAttachments.tsx`,
  `components/ComposerModelPill.tsx`: the parts.
- `components/ComposerMenu.tsx`: the anchored ＋ menu used by painting.
  `hooks/useComposerMediaActions.ts` shares camera and photo-library handoffs with the chat tools
  sheet, retaining permission and input-replacement behavior through `expo-image-picker`. Files use the caller's destination when supplied and
  otherwise use the shared file-upload picker through the Composer adapter.
- `components/ComposerAttachmentStrip.tsx`: internal to `ComposerAttachments`;
  shows import progress, then delegates ready files to `FileEntryPreview`.
- `components/ComposerSessionProvider.tsx` and
  `hooks/useManagedComposerAttachments.ts`: own one composer session and import
  transient picker results into My Files before exposing their references to
  Chat or Painting. Every import belongs to the library as soon as it completes.
  Removing a draft reference, leaving the screen, or failing a send never
  deletes the library file; an in-flight import may finish after its tile is
  removed, but cannot restore that stale tile. Only explicit library deletion
  removes the file. Managed-file storage announces committed writes and the
  app-wide `DataApiProvider` refreshes shared file lists after unmount too.
- `context/ComposerProvider.tsx`: the session's private draft, attachments, and
  field-ref contexts, plus the input-presentation transition. Its contexts are
  split so dispatch-only components and the dock skip keystroke re-renders.
- `hooks/useComposerPresentation.ts`: the shared editing state and keyboard handoff.
  Native keyboard transitions update the frame without issuing another blur.
- `components/ComposerDock.tsx`: pins or reconnects CherryUI's keyboard-tracking
  dock according to the current input context.
- `utils/composerAttachments.ts`: attachment drafts and the message parts they
  turn into, with tests.

## Behavior notes

- Each chat or painting screen's `Composer.Expansion` owns manual large-editor presentation separately from
  editing and draft state. Expand/collapse never moves the editor into a portal or requests native
  focus/blur. Sending and a newly mounted composer session collapse the large editor. Native
  keyboard hiding and input replacements retain its size choice. `Composer.ExpansionMeasure` accounts for accessory height changes so the
  editor stays below the top safe area when attachments grow or disappear.
- Keyboard-preserving overlays keep the current layout. A replacement (the local chat tools
  sheet, model or settings sheet, camera, photo library, or file picker) blurs the field and
  waits for keyboard dismissal and one render frame before opening. A replacement's search
  field has its own native tag. After dismissal the dock stays detached until the field takes
  focus again, including when Android restores old keyboard coordinates. Dismissal
  preserves both the draft and its attachments.
- The shared `ComposerMenu` opens in a keyboard-preserving overlay, without changing the field's
  expanded/resting state or starting a keyboard transition. Cancelling only closes
  the menu. Its measured trigger remains mounted and its screen position is followed
  on the UI thread until dismissal completes, so opening during keyboard motion
  does not leave a detached menu. Available height follows that position; long
  menus scroll above the trigger. Viewport changes dismiss the menu, and media
  actions wait for overlay removal before starting the replacement protocol.
- Transient attachments render their own progress tile while they are imported
  into managed storage. Any importing attachment disables send; text editing,
  removal, and tools remain available. The send boundary rechecks readiness and
  exposes only managed `fileEntryId` attachments to callers. Import timing logs
  contain only kind, size, result, and duration.
- Chat passes `workspaceSessionId`, or the selected `workspaceFolderId` before its first send.
  New imports and newly selected library references use that destination. Switching workspaces
  preserves already prepared attachment references and their files.
- The i18n keys are still under `chat.*`. Two of them (`chat.media.camera`,
  `chat.media.photos`) are shared with the settings screens, so a `composer.*`
  namespace would fork strings rather than move them.

## Send-time file preparation

Picking and importing do not check model suitability or parse document content.
Chat and painting resolve the actual selected model in their backend workflow,
then use the shared file attachment policy and preparation functions. Painting
submits only `fileEntryIds`; it never trusts picker URIs or draft media metadata.

`ComposerSurface` renders structured file issues through one localized alert,
with the filename, reason, and recovery guidance. Other send failures keep their
existing feedback. A rejected submit restores the draft references; it does not
remove files from My Files. Persisted message attachment reports distinguish
text extraction limits from request capacity limits, and older messages without
a report remain unknown.
