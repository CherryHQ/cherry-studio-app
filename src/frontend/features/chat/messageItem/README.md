# Message Item

This module renders role-level chat message rows.

## Public Interface

- `AssistantMessageItem` and `UserMessageItem` are exported from `index.ts`.
- Callers should import from the `messageItem` module root, not from files under `components/`.

## Organization

- `components/` contains the role-specific row layouts.
- Message body rendering is delegated to `messageContent` so row layout and part rendering stay
  separate.
