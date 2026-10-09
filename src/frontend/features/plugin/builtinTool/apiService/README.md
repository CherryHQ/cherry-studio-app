# Web Search API Service Settings

This module owns web search provider API key fields and provider API key settings behavior.

## Public Interface

- API key forms, field groups, hooks, and pure API key helpers are exported from `index.ts`.

## Organization

- `components/` contains field and form UI.
- `hooks/` owns preference-backed API key settings state.
- `utils/` contains pure API key parsing and normalization helpers with co-located tests.
