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
- While a turn is active, the send control becomes stop and calls `cancelTurn` for that Session.
- At rest the composer is one row with the ＋ menu and send action always reachable. Focusing the
  field morphs it into two rows: the field takes the full width, the action row moves below it, and
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
- Follow-up queues and steering are not part of the Version 1 Agent Session composer.
