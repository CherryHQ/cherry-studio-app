# Assistant Screens

This module owns assistant list and editor screens and their private UI.

## Public Interface

- `AssistantListScreen` and `AssistantEditScreen` are exported from `index.ts` for route adapters.

## Organization

- `components/` contains assistant-screen-only UI such as the emoji picker sheet.
- Cross-screen UI comes from neutral modules under `src/components`.
