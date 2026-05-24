# Provider Settings

This module owns provider detail settings, API service settings, and provider model management UI.

## Public Interface

- `ProviderApiManagementSection`, `ProviderModelList`, and `useProviderDetailSettings` are exported
  from `index.ts`.
- API service form hooks, forms, and pure helpers are exported from `apiService/index.ts`.

## Organization

- `components/` contains provider detail page sections.
- `apiService/` owns API key, auth, endpoint draft, dirty-state, and save behavior.
- `detail/` owns provider detail data loading.
- `models/` owns provider model grouping and list UI.
