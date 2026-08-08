# Chat Workspace

This module owns the chat screen workspace: message list, older-message loading indicator, initial
render cover, and floating input placement.

## Public Interface

- `ChatWorkspace` is exported from `index.ts` for normal topic screens.
- `ChatWorkspaceFrame`, `ChatComposer`, and `useFloatingChatInputLayout` are exported for the
  new-topic workspace, which shares the same input placement without a message list.
- `ComposerDock` and `useFloatingChatInputLayout` are also exported for the painting conversation
  screen, which docks a different input the same way. The two used to keep separate copies of the
  placement; anything that moves an input relative to the keyboard or the safe area belongs in the
  dock, not in a caller.
- Internal workspace pieces should be imported through relative paths inside this module.

## Organization

- `components/` contains workspace-only UI pieces.
- `hooks/` owns workspace layout and initial-render coordination.
- `utils/` contains pure helpers with co-located tests.
