# Agent Screens

This module owns the agent list and editor screens for durable Agents backed by the `/agents`
Data API. Agents and Agent Sessions are the only active conversation configuration and persistence
surfaces.

## Public Interface

- `AgentListScreen` and `AgentEditScreen` are exported from `index.ts` for route adapters; the
  editor is shared by the edit and create routes.
- The list header's plus action opens the create-Agent route.
- Tapping a list row opens that Agent's editor.
- The row context menu opens the editor or deletes the Agent — agents have no detail screen.
- The editor's model row opens the shared model-picker bottom sheet. New agents seed the global
  default Agent model; an agent saved without a model cannot start a session until one is assigned.
- The editor exposes the Agent definition fields (avatar, name, default model, and instructions),
  its two-mode tool-approval preference, and Agent-specific MCP extensions. Inference parameters
  and system capability switches are not part of the Agent editor surface.
- Calendar, reminders, health, location, and file capabilities are injected uniformly by the Host
  when their system gates pass. The frontend keeps web search as a Session-scoped composer
  selection; image generation is selected for one submission. Neither is saved on the Agent.
- Tool approval defaults to preserving each tool's application policy. Automatic approval promotes
  only interactive `ask` tools for future turns; it cannot enable a missing/disabled tool or bypass
  system permission and managed-resource checks.
- The avatar is a managed file, not a mutable Agent field, so it has its own endpoint
  (`PUT /agents/:id/avatar`) and is written after the record lands — on create, only once the POST
  returns an id. Picking one only updates the draft; Save commits it. An avatar can be set and
  replaced but not cleared. Unset avatars render the name's first character over a generated colour,
  falling back to a neutral badge while the name is still blank.

## Organization

- `agentForm.ts` keeps the pure form-state seeding and DTO building logic testable outside the
  screens.
- The editor lays its fields out bare rather than in a grouped card, so its route keeps the ordinary
  page background — the field fill needs a lighter page behind it to read as a field at all.
- The editor's route is the one screen in this stack with an opaque header, so the native stack owns
  the top inset. Under the stack's floating header that inset comes from `useHeaderHeight()`, which
  reports an estimate until the native header measures itself and so drops the content into place a
  frame after the push finishes. The bottom inset stays hand-rolled either way, because the avatar
  picker's full-screen modal wipes whatever the scroll view adjusted for itself.
- Cross-screen UI comes from neutral modules under `src/frontend/components`.
