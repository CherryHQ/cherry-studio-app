# Chat Screen

This module owns the chat topic screen, new-topic screen, chat input, message rendering, and chat
workspace behavior.

## Public Interface

- `ChatScreen` and `NewTopicScreen` are exported from `index.ts`.

## Organization

- `input/` owns what chat wires around the shared composer: its tools, its reasoning effort, and the
  assistant/model bookkeeping behind both. The composer itself is
  `@/frontend/components/composer`, shared with painting.
- `workspace/` owns message list placement and loading indicators.
- `prismSweep/` owns the thinking indicator shared by message content and message rows.
- `messageContent/` renders structured message parts.
- `messageItem/` renders user and assistant message rows.
- `runtime/` subscribes to the app-owned `ChatModule`, projects one Topic snapshot through
  `useChatTopic()`, and owns frontend navigation and query invalidation effects. It does not create
  or dispose `ChatRuntime`.
