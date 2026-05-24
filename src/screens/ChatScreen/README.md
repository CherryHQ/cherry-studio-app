# Chat Screen

This module owns the chat topic screen, new-topic screen, chat input, message rendering, and chat
workspace behavior.

## Public Interface

- `ChatScreen` and `NewTopicScreen` are exported from `index.ts`.

## Organization

- `input/` owns the floating chat input and its sheet behavior.
- `workspace/` owns message list placement, loading indicators, and floating input placement.
- `messageContent/` renders structured message parts.
- `messageItem/` renders user and assistant message rows.
