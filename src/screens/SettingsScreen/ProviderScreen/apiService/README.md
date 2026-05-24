# Provider API Service Settings

This module owns provider API key, auth, endpoint draft, validation, and save behavior.

## Public Interface

- Form components, hooks, and page-level pure helpers are exported from `index.ts`.

## Organization

- `components/` contains API key and endpoint form UI.
- `hooks/` owns query, draft, close-confirmation, and dialog adapters.
- `utils/` contains pure draft, dirty-state, validation, and save helpers with tests under the
  provider settings module.
