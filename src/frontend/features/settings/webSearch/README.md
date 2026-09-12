# Web Search Settings

This page branch owns `/settings/websearch` and its advanced child page.

## Public Interface

- The root and `advanced/` pages expose separate route boundaries.
- API management components, context, hooks, and helpers remain private to this page branch.

## Organization

- `WebSearchScreen.tsx` owns the root page; `advanced/` owns `/settings/websearch/advanced` and its
  local numeric input component.
- `apiService/` owns provider checks, API key fields, and API key parsing.
- `components/` contains controls owned by web search settings.
- `context/` coordinates each provider's API management section.
- `hooks/` owns search and fetch provider preferences.
- `utils/` owns provider presentation and override helpers.
