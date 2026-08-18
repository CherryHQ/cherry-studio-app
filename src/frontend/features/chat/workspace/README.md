# Chat Workspace

This module owns Chat-specific workspace orchestration: runtime message projection, older-message
loading state, initial render gating, tool approval, and composer placement. The virtualized list
and message rendering live in `@/frontend/components/messages`.

## Public Interface

- `ChatWorkspace` is exported from `index.ts` for normal topic screens.
- `ChatComposer` is exported for the new-topic workspace, which has no message list.
- Internal workspace pieces should be imported through relative paths inside this module.
- The docking itself (`Composer.Dock`, `useComposerDockLayout`) is not here — CherryUI owns the
  reusable keyboard, safe-area, and measurement behavior. This module only connects those values
  to Chat.

## Organization

- `components/` contains Chat-only composer, loading, and cover UI.
- `hooks/` owns initial-render coordination.
- `utils/` contains pure helpers with co-located tests.
