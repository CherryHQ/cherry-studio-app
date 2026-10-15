# Web Search API Service Settings

This module owns the web search provider credential fields (API key, API address, basic auth) and
the provider check.

## Public Interface

- None. This module is private to the built-in tool pages, which import its field groups and
  provider check hook from their leaf files.

## Organization

- `components/` contains field and form UI.
- `hooks/` owns the provider check.
- `utils/` contains pure API key parsing and normalization helpers with co-located tests.
