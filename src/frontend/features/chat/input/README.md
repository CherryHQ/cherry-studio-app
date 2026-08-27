# Chat Input Behavior

This directory owns the Agent Session composer at the bottom of the chat surface. `ChatInput` is
exported through `index.ts` and receives the current `agentId` and optional `sessionId`.

## Current Contract

- A new Session is created lazily on the first send, then observed before the message is submitted.
- Existing Sessions submit through the live `AgentProtocol` client owned by `ChatProvider`.
- The shared composer owns the draft, send recovery, keyboard behavior, and pasted attachment
  presentation.
- Image attachments are imported into managed storage before send. The Host revalidates their
  authoritative metadata, model capability, provider endpoint, and request limits before admission.
- While a turn is active, the send control becomes stop and calls `cancelTurn` for that Session.
- The resting composer is one row. Focusing it reveals the model pill and reasoning-effort gauge on
  the toolbar below without remounting the field, draft, or send control.
- Picking a model updates the current Agent's `modelId`. Submission also snapshots the visible
  model so an immediate send cannot race the Agent mutation or query refresh. Rapid picks are
  persisted serially and coalesced to the latest visible selection.
- The reasoning gauge inherits the Agent setting until the user picks a value. A pick is local to
  the current Agent composer and is snapshotted into each submission; it never updates Agent
  configuration. An explicit `default` selection bypasses the Agent effort for that turn and uses
  the selected model's default.
- The composer menu owns temporary capabilities. Web search adds `web-search` to the next
  submission; the create-image mention adds `image-generation`. Neither mutates Agent
  configuration. A successful send clears the web selection and the sent draft; failed submission
  preserves both for retry.
- Follow-up queues and steering are not part of the Version 1 Agent Session composer.
