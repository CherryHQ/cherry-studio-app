# Agent Screens

This module owns the agent list and editor screens for durable Agents backed by the `/agents`
Data API. Agents and Agent Sessions are the only active conversation configuration and persistence
surfaces.

## Public Interface

- `AgentListScreen` and `AgentEditScreen` are exported from `index.ts` for route adapters; the
  editor is shared by the edit and create routes.
- Tapping a list row opens a new chat for that Agent; the session is created on first send.
- The row context menu opens the editor or deletes the Agent — agents have no detail screen.
- The editor's model row opens the shared model-picker bottom sheet. New agents seed the global
  default Agent model; an agent saved without a model cannot start a session until one is assigned.
- Inference settings (`temperature`, `maxOutputTokens`, `reasoningEffort`) follow the sparse
  `AgentSettings` contract: a disabled control saves as an explicit-undefined key so the
  shallow-merging update endpoint clears the stored value (`agentForm.ts`).
- Agent avatars are managed file references owned by the future avatar workflow; until it exists
  every agent renders the default badge and the editor offers no avatar control.

## Organization

- `agentForm.ts` keeps the pure form-state seeding and DTO building logic testable outside the
  screens.
- Cross-screen UI comes from neutral modules under `src/frontend/components`.
