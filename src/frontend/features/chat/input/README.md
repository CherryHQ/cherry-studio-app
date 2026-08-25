# Chat Input Behavior

This directory owns the Agent Session composer at the bottom of the chat surface. `ChatInput` is
exported through `index.ts` and receives the current `agentId` and optional `sessionId`.

## Current Contract

- A new Session is created lazily on the first send, then observed before the message is submitted.
- Existing Sessions submit through the live `AgentProtocol` client owned by `ChatProvider`.
- The shared composer owns the draft, send recovery, keyboard behavior, and pasted attachment
  presentation.
- The Agent Host currently reports `attachments: false`. Chat exposes no attachment picker; pasted
  attachments remain removable but sending them fails with an explicit unsupported message.
- While a turn is active, the send control becomes stop and calls `cancelTurn` for that Session.
- Agent model and inference settings are edited on the Agent screen, not inside the composer.
- Web search, tool mentions, follow-up queues, and steering are not part of the Version 1 Agent
  Session composer.
