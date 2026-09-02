# Web Search Settings

This feature owns web search provider settings, provider-specific API configuration, and provider
preference helpers.

## Public Interface

- Route screens are exported from the feature-root `index.ts`.
- `WebSearchScreen/index.ts` exports the screen area's API management section and provider-setting
  helpers.
- API key settings forms, hooks, and API key helpers are exported from
  `WebSearchScreen/apiService/index.ts`.

## Organization

- `components/` contains reusable controls owned by web search settings.
- `hooks/` owns search and fetch provider preferences.
- `WebSearchScreen/` contains the route screens, provider detail sections, context, API service
  forms, and provider-setting helpers.
