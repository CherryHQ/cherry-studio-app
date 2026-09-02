# Provider API Service Settings

This module owns provider API key, auth, endpoint validation, query, and save helpers.

## State ownership

- The `userProvider` row is the only persistent authority; its react-query entries
  (`providers.detail`, `providers.apiKeys`, `providers.authConfig`) are the only in-process
  copy of saved state.
- `ProviderDetailScreen` gates on those queries, then creates one editable draft for provider
  identity, endpoint, and keys. Provider enabled state belongs to the outer provider list.
- Save is explicit. After provider and API-key mutations finish, the mounted form resets its
  baseline to the saved values; leaving with a dirty draft asks for confirmation.

## Public Interface

- Query hooks, close-confirmation behavior, and page-level pure helpers are exported from
  `index.ts`.

## Organization

- `hooks/` owns queries, close-confirmation, and dialog adapters.
- `utils/` contains pure draft, dirty-state, validation, and save helpers with tests under the
  provider settings module.
