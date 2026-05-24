# Chat Workspace

This module owns the chat screen workspace: message list, older-message loading indicator, initial
render cover, and floating input placement.

## Public Interface

- `ChatWorkspace` is exported from `index.ts` for normal topic screens.
- `ChatWorkspaceFrame`, `FloatingChatInput`, and `useFloatingChatInputLayout` are exported for the
  new-topic workspace, which shares the same input placement without a message list.
- Internal workspace pieces should be imported through relative paths inside this module.

## Organization

- `components/` contains workspace-only UI pieces.
- `hooks/` owns workspace layout and initial-render coordination.
- `utils/` contains pure helpers with co-located tests.
