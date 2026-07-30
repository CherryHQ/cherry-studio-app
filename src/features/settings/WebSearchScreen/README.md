# Web Search Settings

This module owns web search provider settings, provider-specific API configuration, and provider
preference helpers.

## Public Interface

- `WebSearchApiManagementSection` and provider setting helpers are exported from `index.ts`.
- API key settings forms, hooks, and API key helpers are exported from `apiService/index.ts`.

## Organization

- `components/` contains web search provider detail sections.
- `context/` owns provider-management context consumed by field groups.
- `apiService/` owns provider API key field UI, API key settings hooks, and API key helpers.
- `utils/` contains provider display and preference merge helpers.
