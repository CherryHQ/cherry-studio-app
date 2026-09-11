# Chat Input Behavior

This directory owns the Agent Session composer at the bottom of the chat surface. `ChatInput` is
exported through `index.ts` and receives the current Agent/Session and the content leaf’s chat controls.

## Current Contract

- An Agent selection owns an isolated Draft composer. Its first send uses `startSession`, which
  admits the message before atomically creating the Session and first message pair; observation and
  navigation begin only after that succeeds.
- Existing Sessions submit through the live `AgentProtocol` client owned by `ChatProvider`.
- Clearing the composer synchronously hands text and attachments to local message rows. During
  admission the send action is disabled and the assistant row shows waiting feedback. Persistence and events
  reuse the IDs allocated by the send action; rejected sends restore the draft and attachments,
  including content added while waiting. Draft-to-Session handoff preserves the list and composer.
- The shared composer owns the draft, send recovery, keyboard behavior, and pasted attachment
  presentation. Draft and existing-Session composers use separate keyed sessions, so navigation
  cannot reuse one Session's draft in another.
- Image attachments are imported into managed storage before send. The Host revalidates their
  authoritative metadata, model capability, provider endpoint, and request limits before admission.
- While a turn is active, the send control becomes stop and calls `cancelTurn` for that Session.
- When empty and outside an editing interaction, the composer is one row with the ＋ menu and send
  action always reachable. Editing, draft text, or attachments keep it expanded into two rows: the field takes the
  full width, the action row moves below it, and
  the model pill and reasoning-effort gauge slide and scale in without animating their glass
  opacity. The field grows with its content up to the shared composer's cap and the toolbar follows
  it down.
- Editing belongs to the whole composer. Focusing the field starts it; opening or closing the ＋
  menu, model picker, file picker, or effort slider preserves it, including with an empty draft.
  A native field blur does not end editing. Touching chat content ends editing even if a picker
  already hid the keyboard; `ChatInput` exposes only a `dismiss` ref action for that outside boundary.
  Hiding the composer's visible keyboard also ends editing. Draft text and attachments still keep
  the surface expanded. Closing an overlay by its backdrop only closes that overlay.
- Native media pickers and model/settings Sheets replace the live input context: the shared
  composer retains editing, pins its dock, blurs the field, and settles keyboard dismissal before presenting them.
  It reconnects keyboard tracking only when the field receives focus again. Menu and effort
  overlays preserve the existing keyboard context instead.
- Picking a model updates the current Agent's `modelId`. Submission also snapshots the visible
  model so an immediate send cannot race the Agent mutation or query refresh. Rapid picks are
  persisted serially and coalesced to the latest visible selection.
- The reasoning gauge derives its stops from the selected model's `selectableEfforts`, retaining
  `xhigh` and `max` as distinct values. It starts at the provider default. A pick is local to the
  current Agent composer and is snapshotted into each submission; it never updates Agent
  configuration. Switching models projects that pick to the closest supported stop. `default`
  bypasses the Agent effort for that turn; `auto` remains a separate provider-controlled mode.
- The composer menu offers media only. Web search and create-image were removed from it, so the
  composer no longer requests any turn-local capability; tool availability comes from Agent
  configuration alone.
- The menu's File row opens the full-height library picker. Its Recent list shares cursor pages
  and batched previews with the library screen. Selection stays local until Add is pressed; the
  action appears only for newly selected, available attachments. Already attached files are marked
  and cannot be added twice. Close discards the selection. Search is not offered.
  The app-wide file-change subscription keeps these shared pages current; opening the picker
  reuses fresh pages without forcing another fetch.
- Upload files closes the library picker and presents the system document picker from chat. Each
  chosen file appears in the composer's attachment strip at once with its upload progress, and is
  uploaded to the library from there: the entry belongs to the library as soon as it lands, so
  removing the attachment afterwards or leaving the chat keeps the file, and the picker lists it
  under Recent next time. Removing the tile while it is still uploading cancels that upload.
- Library selections are ready attachments borrowed by entry ID, so removing one from the composer
  leaves the library file intact. Camera, photos, and painting keep their existing flows.
- Follow-up queues and steering are not part of the Version 1 Agent Session composer.
