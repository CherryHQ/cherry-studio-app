# Web Search API Service Settings

This module owns the web search provider credential fields (API key, API address, basic auth) and
the provider check.

## Public Interface

- Field groups and pure API key helpers are exported from `index.ts`.

## Organization

- `components/` contains field and form UI.
- `hooks/` owns the provider check.
- `utils/` contains pure API key parsing and normalization helpers with co-located tests.
