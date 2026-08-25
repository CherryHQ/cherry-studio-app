# Chat Workspace

This module owns Agent Session workspace orchestration: runtime message projection, older-message
loading state, initial render gating, message actions, and composer placement. The virtualized list
and message rendering live in `@/frontend/components/messages`.

## Public Interface

- `ChatWorkspace` is exported from `index.ts` for Agent Session screens.
- Internal workspace pieces should be imported through relative paths inside this module.
- The docking itself (`Composer.Dock`, `useComposerDockLayout`) is not here — CherryUI owns the
  reusable keyboard, safe-area, and measurement behavior. This module only connects those values
  to Chat.

## Organization

- `components/` contains loading, cover, and the assistant action toolbar composed through
  `AssistantMessage`. `ChatScreen` mounts the composer session directly because it owns whether the
  input exists and must keep that session outside its session/empty-state branch.
- `context/` owns assistant-message action state and actions. Dynamic copied/busy/enabled state is consumed
  only by toolbar leaves; the virtualized list and expensive message body do not subscribe.
- `hooks/` owns initial-render coordination.
- `utils/` contains pure helpers with co-located tests, including copyable-text projection.
