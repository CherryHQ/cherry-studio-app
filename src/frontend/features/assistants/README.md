# Assistant Screens

This module owns assistant list, detail, and editor screens and their private UI.

## Public Interface

- `AssistantListScreen`, `AssistantDetailScreen`, and `AssistantEditScreen` are exported from
  `index.ts` for route adapters.
- Tapping a list row opens the detail screen; the detail screen's header "Edit" action opens the
  editor, which is also reused by the create route.
- The detail screen's "Start chat" action routes to `/topics` with the assistant id, so the first
  message there creates a topic already bound to that assistant.

## Organization

- `components/` contains assistant-screen-only UI such as the emoji picker sheet.
- Cross-screen UI comes from neutral modules under `src/frontend/components`.
