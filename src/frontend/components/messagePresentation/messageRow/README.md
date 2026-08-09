# Message Row

This module renders role-level chat message rows.

## Internal Interface

- `AssistantMessageRow`, `UserMessageRow`, and `MessageSlideInProvider` are exported from the local
  `index.ts` only for `MessageList`.

## Organization

- `components/` contains the role-specific row layouts.
- Message body rendering is delegated to `messageContent` so row layout and part rendering stay
  separate.
