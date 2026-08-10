# Chat Screen

This module owns the chat topic screen, new-topic screen, chat input, runtime projection, and chat
workspace behavior. Structured message presentation is shared with painting through
`@/frontend/components/messagePresentation`.

## Public Interface

- `ChatScreen` and `NewTopicScreen` are exported from `index.ts`.

## Organization

- `input/` owns what chat wires around the shared composer: its tools, its reasoning effort, and the
  assistant/model bookkeeping behind both. The composer itself is
  `@/frontend/components/composer`, shared with painting.
- `workspace/` adapts visible Chat runtime messages into the shared `MessageList`, and owns loading
  indicators, initial-render gating, tool approvals, and composer placement.
- `runtime/` subscribes to the app-owned `ChatModule`, projects one Topic snapshot through
  `useChatTopic()`, and owns frontend navigation and query invalidation effects. It does not create
  or dispose `ChatRuntime`.
