# Provider API Service Settings

This module owns provider API key, auth, endpoint validation, query, and save helpers.

## State ownership

- The `userProvider` row is the only persistent authority; its react-query entries
  (`providers.detail`, `providers.apiKeys`, `providers.authConfig`) are the only in-process
  copy of saved state.
- `components/ProviderConfiguration` writes each change through `useProviderApiServiceQueries`;
  there is no page-level draft for saved providers. Address changes keep the guards against
  removing an endpoint a model uses and against silently moving the default endpoint models
  follow.
- `useProviderApiServiceSheetClose` confirms leaving an unsaved custom-provider draft and returns
  home when a provider screen has nothing to go back to.

## Public Interface

- Query hooks, close-confirmation behavior, and pure helpers are exported from
  `index.ts`.

## Organization

- `hooks/` owns configuration drafts and saves, queries, close-confirmation, and dialog adapters.
- `utils/` contains pure draft, dirty-state, validation, and save helpers with tests under the
  provider settings module.
