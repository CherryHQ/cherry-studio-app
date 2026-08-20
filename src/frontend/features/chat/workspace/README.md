# Chat Workspace

This module owns Chat-specific workspace orchestration: runtime message projection, older-message
loading state, initial render gating, tool approval, and composer placement. The virtualized list
and message rendering live in `@/frontend/components/messagePresentation`.

## Public Interface

- `ChatWorkspace` is exported from `index.ts` for normal topic screens.
- `ChatComposer` is exported for the new-topic workspace, which has no message list.
- Internal workspace pieces should be imported through relative paths inside this module.
- The docking itself (`ComposerDock`, `useComposerDockLayout`) is not here — it moved to
  `@/frontend/components/composer` once painting docked an input the same way. Anything that moves
  an input relative to the keyboard or the safe area belongs there, not in a caller.

## Organization

- `components/` contains Chat-only composer, loading, cover, and the assistant action toolbar
  composed through `AssistantMessage`.
- `context/` owns assistant action state and actions. Dynamic copied/busy state is consumed only by
  toolbar leaves; the virtualized list and expensive message body do not subscribe.
- `hooks/` owns initial-render coordination.
- `utils/` contains pure helpers with co-located tests, including copyable-text projection.
