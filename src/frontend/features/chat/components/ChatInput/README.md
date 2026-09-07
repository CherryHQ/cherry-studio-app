# Chat Input Behavior

This directory owns the Agent Session composer at the bottom of the chat surface. `ChatInput` is
exported through `index.ts` and receives the current `agentId` and optional `sessionId`.

## Current Contract

- An Agent selection owns an isolated Draft composer. Its first send uses `startSession`, which
  admits the message before atomically creating the Session and first message pair; observation and
  navigation begin only after that succeeds.
- Existing Sessions submit through the live `AgentProtocol` client owned by `ChatProvider`.
- The shared composer owns the draft, send recovery, keyboard behavior, and pasted attachment
  presentation. Draft and existing-Session composers use separate keyed sessions, so navigation
  cannot reuse one Session's draft in another.
- Image attachments are imported into managed storage before send. The Host revalidates their
  authoritative metadata, model capability, provider endpoint, and request limits before admission.
- While a turn is active and the composer is empty, the primary action becomes Stop without
  showing submission options. Composing the next message reveals queue/steer options and a separate
  Stop action while the primary action becomes Send. Stop calls `cancelTurn` and pauses automatic
  queue drain. A busy submission can queue for the next reply or steer the explicitly selected
  current turn; only text with matching model/reasoning settings can steer.
- Submission identity belongs to the composer attempt. Retrying a restored unchanged payload
  reuses its `inputId`; accepting it clears the draft even when it is queued or awaiting steering.
- The queue entry observes Host snapshots/events through a leaf selector. Its sheet supports pause,
  resume, text edits that preserve attachments, remove, move earlier/later, and promotion of the
  same queued identity to steering. Interrupted inputs require explicit requeue, then resume.
  The entry is hidden when there are no pending inputs, even when paused; an already-open sheet
  stays open if the last input is removed. Queue edits do not create transcript rows, and the
  frontend never drains the queue.
- An approval sheet may be temporarily dismissed to compose inputs. Its reminder reopens the
  pending request; only an explicit approve/deny decision releases the tool's approval gate.
- When empty and unfocused, the composer is one row with the ＋ menu and primary action always
  reachable. Focus, draft text, or attachments keep it expanded into two rows: the field takes the
  full width, the action row moves below it, and
  the model pill and reasoning-effort gauge slide and scale in without animating their glass
  opacity. The field grows with its content up to the shared composer's cap and the toolbar follows
  it down.
- Native media pickers and model/settings Sheets replace the live input context: the shared
  composer pins its dock, blurs the field, and settles keyboard dismissal before presenting them.
  It reconnects keyboard tracking only when the field receives focus again. Menu and effort
  overlays preserve the existing keyboard context instead.
- Picking a model updates the current Agent's `modelId`. Submission also snapshots the visible
  model so an immediate send cannot race the Agent mutation or query refresh. Rapid picks are
  persisted serially and coalesced to the latest visible selection.
- The reasoning gauge inherits the Agent setting until the user picks a value. A pick is local to
  the current Agent composer and is snapshotted into each submission; it never updates Agent
  configuration. An explicit `default` selection bypasses the Agent effort for that turn and uses
  the selected model's default.
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
- A fresh observer reconstructs the pending queue after navigation. Restart restores queues paused;
  uncertain dispatch or steering requires review before retrying.
