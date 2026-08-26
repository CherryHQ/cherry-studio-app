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
- The editor exposes only the Agent definition fields: avatar, name, default model, and
  instructions. Inference parameters are not part of the Agent editor surface.
- The avatar is a managed file, not a mutable Agent field, so it has its own endpoint
  (`PUT /agents/:id/avatar`) and is written after the record lands — on create, only once the POST
  returns an id. Picking one only updates the draft; Save commits it. An avatar can be set and
  replaced but not cleared. Unset avatars render the name's first character over a generated colour,
  falling back to a neutral badge while the name is still blank.

## Organization

- `agentForm.ts` keeps the pure form-state seeding and DTO building logic testable outside the
  screens.
- The editor lays its fields out bare rather than in a grouped card, so its route keeps the ordinary
  page background — the field fill needs a lighter page behind it to read as a field at all. It also
  owns its top content inset instead of leaving it to the scroll view, because the avatar picker's
  full-screen modal wipes the automatic one on dismissal.
- Cross-screen UI comes from neutral modules under `src/frontend/components`.
