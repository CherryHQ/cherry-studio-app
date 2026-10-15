# Built-In Tools

This page branch owns `/plugins/tools/web-search` and `/plugins/tools/fetch-urls`, the pages for the
application-owned tools listed on the Plugins page.

## Public Interface

- `index.ts` exports both route screens, the `BUILTIN_TOOLS` definitions the Plugins page lists, and
  `getWebSearchProviderDisplayName`, which names the provider serving each listed tool.
- API management components, context, hooks, and helpers remain private to this page branch.

## Organization

- `BuiltinToolScreen.tsx` renders either tool: identity, its provider and credentials, and for web
  search the result count and compression settings.
- `apiService/` owns provider checks, the API key, API address, and basic-auth fields, and API key
  parsing.
- `components/` contains controls owned by the tool pages.
- `context/` coordinates each provider's API management section.
- `hooks/` owns search and fetch provider preferences.
- `utils/` owns provider presentation, the settings each provider exposes, and override helpers.
