# Message Row

This module renders role-level chat message rows.

## Internal Interface

- `AssistantMessageRow`, `UserMessageRow`, and `MessageSlideInProvider` are exported from the local
  `index.ts` only for `MessageList`.

## Organization

- `components/` contains the role-specific row layouts.
- User rows compose a right-aligned attachment strip above the optional text bubble. Both remain
  inside one long-press menu and one entry animation.
- `utils/partitionUserMessageParts.ts` projects managed file parts into that strip without changing
  the persisted message or its original part order.
- Message body rendering is delegated to `messageContent` so row layout and part rendering stay
  separate.
- `slideIn/` carries the entrance of a just-sent user row from the composer edge to the pinned
  position. The pin scroll covers however much of that distance it takes to move the older content
  out of the way, and this transform covers the rest, so a brand-new topic — where there is nothing
  to scroll — still gets the same entrance. `MessageList` owns the flight because both its distance
  (viewport and insets) and its trigger (the frame the anchor lands on) are list-level facts; the
  provider only delivers it past `renderItem`.
