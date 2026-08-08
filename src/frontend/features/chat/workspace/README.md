# Chat Workspace

This module owns the chat screen workspace: message list, older-message loading indicator, and
initial render cover.

## Public Interface

- `ChatWorkspace` is exported from `index.ts` for normal topic screens.
- `ChatWorkspaceFrame` and `ChatComposer` are exported for the new-topic workspace, which shares
  the same shell without a message list.
- `ChatMessageList` and `ScrollToBottomButton` are exported for the painting conversation screen,
  which renders the same list around a different input.
- Internal workspace pieces should be imported through relative paths inside this module.
- The docking itself (`ComposerDock`, `useComposerDockLayout`) is not here — it moved to
  `@/frontend/components/composer` once painting docked an input the same way. Anything that moves
  an input relative to the keyboard or the safe area belongs there, not in a caller.

## Organization

- `components/` contains workspace-only UI pieces.
- `hooks/` owns workspace layout and initial-render coordination.
- `utils/` contains pure helpers with co-located tests.
