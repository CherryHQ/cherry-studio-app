# Agent Screens

This module owns the agent list and editor screens for durable Agents backed by the `/agents`
Data API. Agents and Agent Sessions are the only active conversation configuration and persistence
surfaces.

## Public Interface

- `AgentListScreen` is the root page. `edit/AgentEditScreen` is shared by the edit and create route
  adapters.
- The list header's plus action opens the create-Agent route.
- Creating from the chat header's Agent picker opens a draft conversation with the saved Agent.
  Creating from the management list returns to that list.
- Tapping a list row opens that Agent's editor.
- Long-pressing a row enters multi-selection and selects that Agent. Rows keep one press target
  across the mode change, so releasing the long press cannot open the editor or toggle it again.
  The shared selection toolbar selects all current search results or confirms batch deletion;
  back and Done exit selection. Changing the search clears selection. Agents have no detail screen.
- The editor's model row opens the shared model-picker bottom sheet for text and image models. New agents seed the global
  default Agent model; an agent saved without a model cannot start a session until one is assigned.
- The editor exposes the Agent definition fields (avatar, name, default model, and instructions),
  its two-mode tool-approval preference, and Agent-specific MCP extensions. Inference parameters
  and system capability switches are not part of the Agent editor surface.
- Existing agents save edits automatically without a Save action. Name and instructions wait for
  600 ms of idle input, then save; blur, leaving the page, and backgrounding flush pending text.
  Other fields save immediately. Writes run in order and retain only the latest queued change per
  field. Failed writes keep the draft and offer Retry. A blank name remains invalid and never
  replaces the stored name. New agents still require an explicit Save to create the record.
- Calendar, reminders, health, location, and file capabilities are injected uniformly by the Host
  when their system gates pass. The frontend keeps web search as a Session-scoped composer
  selection. Selecting an image model saves that model on the Agent; image parameters belong to
  each submission. Image-model conversations remain ordinary Agent Sessions in the chat drawer.
- New agents, including the initial Cherry Agent, default to automatic tool approval. Automatic
  approval promotes only eligible interactive `ask` tools for future turns; it cannot enable a
  missing/disabled tool or bypass system permission and managed-resource checks. Existing agents
  keep their saved approval mode.
- Uploaded avatars are managed files with their own endpoint
  (`PUT /agents/:id/avatar`) and is written after the record lands — on create, only once the POST
  returns an id. Picking one saves immediately when editing; on create, Save commits the draft.
  An avatar can be set and replaced but not cleared. The preinstalled Cherry Agent stores `🍒`;
  onboarding uses the same emoji when it creates an Agent. Renaming preserves the stored emoji,
  and choosing a photo replaces it. Unset avatars render the name's first character over a generated
  colour, falling back to a neutral badge while the name is still blank.

## Organization

- `edit/components/` contains the editor's capability and MCP tool sections; they remain private to
  the editor page.
- `edit/agentForm.ts` keeps the pure form-state seeding and DTO building logic testable outside the
  screen.
- The editor lays its fields out bare rather than in a grouped card, so its route keeps the ordinary
  page background — the field fill needs a lighter page behind it to read as a field at all.
- The editor's route is the one screen in this stack with an opaque header, so the native stack owns
  the top inset. Under the stack's floating header that inset comes from `useHeaderHeight()`, which
  reports an estimate until the native header measures itself and so drops the content into place a
  frame after the push finishes. The bottom inset stays hand-rolled either way, because the avatar
  picker's full-screen modal wipes whatever the scroll view adjusted for itself.
- Cross-screen UI comes from neutral modules under `src/frontend/components`.


Agents can also be created and edited through the conversation's built-in Agent management tools.
The capabilities section toggles them per Agent through the `agents` capability group, in the same
list as the device groups; new Agents start with it off, while the seeded default Agent keeps it on. The tools reuse `AgentService`; tool-created Agents inherit the global default model and the editor's
capability defaults. Guarded tool updates preserve omitted fields and reject stale `updatedAt`
versions. Committed create/update operations publish Data API cache invalidations for the list and
changed record. Existing editor drafts are not replaced by incoming cache refreshes.
