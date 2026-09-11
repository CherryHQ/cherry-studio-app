# Composer

Shared chat and painting composition built on CherryUI's presentational `Composer`.
The module owns draft text, managed attachment references, submission recovery, and explicit
input transfers. Feature callers assemble their own controls and layout.

## Public Interface

- `ComposerSessionProvider` owns one mounted draft and its attachment imports. Contexts separate
  content, actions, editor handle, and dock presentation so action-only consumers skip keystrokes.
- `ComposerSurface` owns send admission and recovery. `canSend` adds caller conditions;
  `getSendErrorLabel` and `labels` customize feedback. Sending never dismisses the keyboard.
- `ComposerField` preserves native editor ownership of text, composition, and selection. Native
  focus/blur are forwarded without changing composer layout or dock policy. Pasted images enter
  the attachment pipeline. Programmatic draft replacement is reserved for send/restore actions.
- `ComposerAttachments` shows pending, failed, and ready references. Removing a reference does not
  delete its library file. Failed imports remain visible and block sending until removed/reselected.
- `ComposerMenu` owns native camera/photo/document transfers. Its optional `onPickFiles` destination
  owns its own presentation lifecycle; chat uses `useComposerSheet` for the library. `onOpen` lets
  callers close a competing lightweight panel on the explicit opening gesture.
- `ComposerModelPill` is a model action; its caller owns presentation through `useComposerSheet`.
- `useComposerSheet` opens one sheet per hook instance and keeps the transfer active until close
  or unmount. `useComposerDocumentPicker` keeps it active throughout native document selection.
- `useComposerPresentationActions().runInputReplacement` suspends dock tracking, blurs the editor,
  awaits keyboard dismissal and a removal frame, then awaits the complete replacement operation.
  Completion, cancellation, or failure releases tracking without requesting text focus. Competing
  transfers are ignored while one is active. Library upload awaits sheet release before opening
  its native picker, and unmount prevents a delayed presentation from opening.
- `useComposerPresentationState` exposes only dock keyboard tracking. Native keyboard events do not
  start/end editing, collapse controls, or infer picker completion.
- `ComposerDock` connects this state to CherryUI's keyboard-aware dock.

## Submission And Recovery

The send boundary rejects empty/disabled/unready content and holds a synchronous admission lock.
It snapshots text and ready attachment references, clears the submitted draft, and awaits the
caller. Failure restores the original draft only if its content revision has not changed.
Typing and then deleting still counts as editing. When a newer draft exists, the failed snapshot
is retained separately with Restore/Discard controls. Replacing a nonempty draft requires explicit
confirmation; editing after that confirmation invalidates it. No recovery action requests focus.

Feedback uses nonmodal toasts. File failures include the structured reason and recovery guidance.
Leaving the mounted composer prevents its delayed failure from modifying another context. Drafts
and failed snapshots currently remain local to the mounted session; navigation-wide retention is
still a target in the [interaction contract](../../../../docs/references/chat/input-interaction.md).

## Attachment Ownership

`useManagedComposerAttachments` imports transient picker results into My Files. Each import belongs
there as soon as it completes. Removing a tile invalidates its completion for this draft without
promising cancellation of file I/O. Failed imports retain a removable tile and never produce a
silent partial send. The backend checks model suitability and prepares file content during send;
picking itself does not parse documents or choose another model.

The app-wide file query bridge refreshes library lists after committed writes, including writes
that finish after the composer unmounts. Only explicit library deletion removes an imported file.

The i18n keys remain under `chat.*`; painting shares the same mechanics without adopting chat's
plugin/model-effort layout. Native keyboard and selection conformance still requires device
acceptance; source review alone cannot establish responder timing.
