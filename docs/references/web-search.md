# Web Search

This reference defines the external web search architecture and separates it from provider-native
web search. Terms follow [Domain Language](./domain-language.md).

## Two Web Search Paths

Cherry Mobile has two different concepts that are easy to confuse:

**Provider-Native Web Search**:
Model-native web search configured through AI provider options during an AI request. This path is
built in `src/backend/ai/utils/websearch.ts` and participates in `AiService` provider
options.

**Web Search Provider**:
An external search/fetch provider executed by `WebSearchService`. This path is preference-backed and uses its own provider registry. It is also bridged into AI requests as the `web_search` tool (see [Web Search In AI Requests](#web-search-in-ai-requests)), but its execution, registry, and persistence stay independent of AI provider options.

Do not use "web search" without specifying which path is being discussed when architecture or persistence matters.

## External Web Search Runtime

The external search path is:

`WebSearchService -> createWebSearchProvider() -> provider driver -> post-processing`

`WebSearchService` lives under `src/backend/services/webSearch` and reads web search preferences
through `PreferenceService`. Bootstrap keeps both concrete implementations private; frontend
preference access uses `PreferenceClient`, while provider checks use the narrow `webSearch`
workflow module.

Runtime behavior:

- Selects a provider by requested capability.
- Builds runtime config from preferences.
- Creates a provider driver from the web search registry.
- Runs one provider request per normalized keyword/url input.
- Merges successful results.
- Logs partial input failures.
- Filters blacklisted domains.
- Applies post-processing and compression settings.

Abort errors are propagated when the caller's signal is aborted.

## Web Search In AI Requests

External web search reaches the model as an AI-SDK tool, not as provider options.
`src/backend/ai/tools/adapters/aiSdk/builtin/WebSearchTool.ts` wraps
`WebSearchService.searchKeywords` in a `web_search` tool (id `WEB_SEARCH_TOOL_NAME`) with a `2..200`
self-contained query schema. Its `execute` classifies failures: permanent configuration errors
return a do-not-retry message, transient errors return a retryable note, and abort errors are
rethrown.

`buildAgentParams` (`src/backend/ai/runtime/aiSdk/params/buildAgentParams.ts`)
arbitrates the external tool against provider-native web search (the provider-native path is
attached as a plugin by `buildAgentPlugins` in
`src/backend/ai/runtime/aiSdk/params/buildAgentPlugins.ts`) — they are mutually
exclusive within one request:

- Provider-native is forced for OpenRouter built-in web-search models and `sonar` models; the external tool is never attached for them.
- Otherwise the external `web_search` tool is attached when the assistant has web search enabled, the model supports function calling, and either an external provider is configured or the model has no native web-search plugin config.
- When the tool is attached, the request also sets `stopWhen: stepCountIs(...)` (bounded by the assistant's max tool calls, default 20).

This means a request carries at most one web-search mechanism. Enabling web search without a configured external provider still attaches the tool so calls fail with an explicit unsupported/not-configured error rather than silently doing nothing.

## Provider Registry

Current mobile web search provider ids:

- `zhipu`
- `tavily`
- `searxng`
- `exa`
- `bocha`
- `querit`
- `jina`

Current unsupported mobile entries (registered as `UnsupportedProvider` in
`src/backend/services/webSearch/providers/registry.ts`):

- `exa-mcp`
- `fetch`
- `firecrawl`

Unsupported entries are hidden from mobile settings and default-provider selectors until implemented. They remain in the provider id set and runtime registry as `UnsupportedProvider` entries so old preferences or synced desktop values fail with an explicit unsupported-provider error instead of being silently mapped or dropped.

## Preferences

Web search configuration is stored in preferences, not in the AI ProviderService schema.

Important preferences include:

- default keyword-search provider.
- default URL-fetch provider.
- max result count.
- compression settings.
- provider overrides.
- excluded domains.

Provider overrides hold provider-specific API configuration for the external web search path.

## Zhipu Exception

Zhipu is a deliberate exception: the web search API management UI routes users to the normal AI provider settings page for `zhipu`. Other external web search provider keys are managed through web search provider overrides.

Document this as an exception, not evidence that WebSearchService has merged into ProviderService. Do not generalize the Zhipu bridge into a shared rule unless desktop web-search semantics change.

## Post-Processing

Search results pass through blacklist filtering and response post-processing before they are returned. Compression settings are part of runtime config.

## Reopen When

- Mobile implements `exa-mcp`, `fetch`, `firecrawl`, or another desktop web-search provider.
- A single AI request needs to combine external and provider-native web search instead of arbitrating to one.
