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
- bounds fetched page content and applies configured search-result compression;
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

## Content And Presentation Limits

Post-processing runs after successful provider responses are merged and before tool results are
returned to the Runtime. The model, persisted tool parts, and later turns therefore consume the
same bounded content; snapshots do not store a second full-page copy.

- `web_fetch` always limits each result to 4,000 estimated tokens. A call shares at most 16,000
  estimated tokens equally across its successful results, so up to four pages receive the full
  per-page allowance and a 20-page batch receives 800 per page. This is independent of stored
  search-compression preferences, including `none`.
- `web_search` defaults to `cutoff`, sharing the configured token budget (2,000 by default)
  equally across results. Existing explicit settings, including `none`, are retained.
- Both cutoff paths reuse `tokenx`, which estimates tokens rather than running the selected
  model's tokenizer. Each result also has a character ceiling of six times its token allowance
  (24,000 characters for a single fetched page). This bounds whitespace and numeric runs that
  the estimator can undercount. These are content limits, not a byte-size or model-context guarantee.
- A shortened result includes `truncated: true` beside its content. The tool output contract keeps
  that field optional for old messages. The marker tells the model that the missing tail is
  unavailable; an identical repeat fetch does not retrieve another segment.
- Search and fetch results use source cards with at most 300 characters of summary and three
  visible lines. Opening a card opens the original page. Summary extraction inspects at most
  8,000 characters per result, including for older unbounded tool results.
- Generic and MCP tool details share a 4,000-character text preview budget across their output
  blocks, applied before Markdown rendering. Overflow offers **Copy full text**, which reads the
  complete textual output on demand without expanding the render tree. Images retain their
  existing presentation and are excluded from text copies. This preview does not alter stored
  generic or MCP results.

The allowances separate reading a source for an answer from previewing it in a chat. They are
initial product limits, not measured device-performance thresholds. Full provider responses still
arrive over the network before post-processing, and multiple tool calls can accumulate more than
one call's budget in a turn. Previously stored content is not rewritten.

## Reopen When

- Mobile implements one of the currently unsupported external providers.
- A request needs defined arbitration between external and provider-native search.
