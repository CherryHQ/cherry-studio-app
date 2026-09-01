# Web Search

This reference defines the external web-search service and separates it from provider-native model
features. Terms follow [Domain Language](./domain-language.md).

## Current Product Boundary

Cherry Mobile retains two independent configurations:

- **Provider-native web search** is a model/provider request option.
- **Web Search Provider** is a preference-backed external search/fetch service implemented by
  `WebSearchService`.

`WebSearchService` reaches Agent turns through the application-owned `web_search` and `web_fetch`
Runtime tools, never through an AI SDK tool set. Availability comes from the Agent's tool
configuration alone: the composer carries no web-search control, so it requests no turn-local
`web-search` capability and keeps no per-Session selection.

The settings workflow still configures and checks external providers globally, and a lookup that
fails because no provider is configured returns a terminal result telling the model to stop
retrying rather than a transient error.

## External Runtime

```text
WebSearchService -> createWebSearchProvider() -> provider driver -> post-processing
```

`WebSearchService` lives under `src/backend/services/webSearch` and reads preferences through
`PreferenceService`. Bootstrap keeps it private. Frontend settings reach provider health checks
through the narrow `webSearch` workflow module and reach configuration through `PreferenceClient`.

Runtime behavior:

- selects a provider by requested capability;
- builds runtime configuration from preferences;
- executes one request per normalized keyword or URL;
- merges successful results and logs partial failures;
- applies configured post-processing and compression;
- propagates caller aborts.

## Provider Registry

Current mobile provider ids are `zhipu`, `tavily`, `searxng`, `exa`, `bocha`, `querit`, and `jina`.
`exa-mcp`, `fetch`, and `firecrawl` remain explicit unsupported entries. They are hidden from mobile
settings and selectors, while old stored ids fail with an unsupported-provider error rather than
being silently rewritten.

## Preferences

External web-search configuration remains separate from `ProviderService`. It includes default
keyword and URL providers, max results, compression settings, and provider-specific overrides.

Zhipu is a deliberate UI exception: its API management entry routes to the normal AI provider
settings. This does not merge `WebSearchService` into the AI provider subsystem.

## Reopen When

- Mobile implements one of the currently unsupported external providers.
- A request needs defined arbitration between external and provider-native search.
