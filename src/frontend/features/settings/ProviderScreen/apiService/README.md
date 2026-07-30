# Provider API Service Settings

This module owns provider API key, auth, endpoint draft, validation, and save behavior.

## State ownership

- The `userProvider` row is the only persistent authority; its react-query entries
  (`providers.detail`, `providers.apiKeys`, `providers.authConfig`) are the only in-process
  copy of saved state.
- `ProviderDetailScreen` is read-only: every field it shows is derived from those queries.
  It gates on them so its content reaches its final structure on the first frame — a block
  inserted a commit later shifts everything below it, which the model-toolbar e2e flows
  used to have to wait out.
- Edit drafts live in the mounted form component of `ProviderEndpointSettingsScreen` /
  `ProviderApiKeySettingsScreen` and die with it. There is no post-save baseline to
  maintain: a save resolves only after its query invalidation settles, so the dirty
  helpers (draft vs query data) come clean on their own.

## Public Interface

- Form components, hooks, and page-level pure helpers are exported from `index.ts`.

## Organization

- `components/` contains API key and endpoint form UI.
- `hooks/` owns query, draft, close-confirmation, and dialog adapters.
- `utils/` contains pure draft, dirty-state, validation, and save helpers with tests under the
  provider settings module.
