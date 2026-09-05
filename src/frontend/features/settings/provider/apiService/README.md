# Provider API Service Settings

This module owns provider API key, auth, endpoint validation, query, and save helpers.

## State ownership

- The `userProvider` row is the only persistent authority; its react-query entries
  (`providers.detail`, `providers.apiKeys`, `providers.authConfig`) are the only in-process
  copy of saved state.
- `useProviderConfigurationForm` owns the editable draft for saved provider identity, endpoints,
  and keys. Both provider details and configuration setup consume it; the screens own navigation
  and success feedback. Setup additionally requires usable credentials before continuing.
- The same save path protects referenced endpoints and confirms default-endpoint changes that
  affect existing models. Provider enabled state belongs to the explicit setup workflow.
- Save is explicit. After provider and API-key mutations finish, the mounted form resets its
  baseline to the saved values; leaving with a dirty draft asks for confirmation.

## Public Interface

- The shared configuration form, query hooks, close-confirmation behavior, and pure helpers are exported from
  `index.ts`.

## Organization

- `hooks/` owns configuration drafts and saves, queries, close-confirmation, and dialog adapters.
- `utils/` contains pure draft, dirty-state, validation, and save helpers with tests under the
  provider settings module.
