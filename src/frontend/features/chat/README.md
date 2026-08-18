# Chat Screen

This module owns the chat topic screen, chat input, runtime projection, and chat workspace
behavior. Structured message rendering is shared with painting through
`@/frontend/components/messages`.

## Public Interface

- `ChatScreen` is exported from `index.ts`.

## Organization

- `ChatScreen.tsx` is header + swappable body + docked composer. With a topic the body is the
  conversation, without one it is the empty-state copy; the composer stays mounted across that
  swap so a draft survives the first send creating a topic.
- `input/` owns what chat wires around the shared composer: its tools, its reasoning effort, and the
  assistant/model bookkeeping behind both. The composer itself is
  `@/frontend/components/composer`, shared with painting.
- `workspace/` adapts visible Chat runtime messages into the shared `MessageList`, and owns loading
  indicators, initial-render gating, and tool approvals.
- `runtime/` subscribes to the app-owned `ChatModule`, projects one Topic snapshot through
  `useChatTopic()`, and owns frontend navigation and query invalidation effects. It does not create
  or dispose `ChatRuntime`.
