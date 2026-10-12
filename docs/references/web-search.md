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

The Plugins page's built-in tool pages (**Web search** and **URL fetch**) configure and check
external providers globally, and a lookup that
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
- executes one request per normalized keyword or URL using only the selected provider;
- returns successful results alongside failed inputs, retaining error kind, message, and available
  status/code even when every input fails;
- logs failures with their provider and capability; it never retries or switches providers;
- bounds fetched page content and applies configured search-result compression;
- propagates caller aborts.

## Provider Registry

The provider set is closed. Each id has a preset, one hand-written adapter in the registry, and
settings derived from the preset; users choose among them and supply credentials. Provider ids,
preset shape, and preference keys are vocabulary shared with Cherry Studio desktop.

| Provider | Search | Page reading | Credentials |
| --- | --- | --- | --- |
| `zhipu` | yes | | Zhipu model provider key |
| `tavily`, `exa`, `bocha`, `parallel`, `serply` | yes | | API key required |
| `querit` | yes | yes | API key required |
| `exa-mcp` | yes | yes | none; uses the `exa` key when one is set |
| `jina`, `firecrawl` | yes | yes | API key optional |
| `searxng` | yes | | self-hosted address; optional basic auth |
| `crawl4ai` | | yes | self-hosted address; optional token |
| `fetch` | | yes | none; see [Local Extraction](#local-extraction) |

Each preset capability declares `requiresApiHost` and `requiresApiKey`. `WebSearchService` enforces
them before any request, so a missing key or address is the same configuration failure for every
provider. Two presets differ from desktop on purpose: Jina search does not require a key, because
`s.jina.ai` answers anonymous requests and search then works before anything is configured; and
SearXNG has no default address, because a phone has no local instance to reach.

Fresh installations retain hosted Exa MCP for keyword search (`web_search_exa`) and Jina Reader
for page reading, both without requiring a user API key. Exa MCP also supports page reading
(`web_fetch_exa`) when explicitly selected; its optional key uses `x-api-key`.
Both services handle page extraction remotely. The Exa adapter is a fixed HTTP adapter for that
one hosted service, not a general MCP client: it accepts MCP JSON and SSE responses, preserves
both `Highlights` and `Text` search content, and treats protocol/tool errors as failures rather
than empty successful searches.

SearXNG returns the instance's result snippets and sends the configured engine list only when one
is stored; it does not read each result page. Several API keys rotate per provider across lookups,
over distinct keys.

## Provider Settings

The **Web search** and **URL fetch** pages each show the selected provider followed by the settings
that provider has for that capability:

- **API key** for keyed services. Zhipu instead links to its model provider, and Exa MCP has no
  field of its own.
- **API address** for every provider that calls a service. The field holds only the user's own
  address; left empty, the built-in address applies and shows as the placeholder. A self-hosted
  provider has no built-in address and cannot run until one is entered. Only HTTP(S) addresses are
  saved.
- **Basic auth** username and password for SearXNG.

Search and page reading keep separate addresses for a provider that serves both. Fields save when
editing ends. One **Check** button sits beside the setting the check depends on: the address for a
self-hosted provider or one without a key field, otherwise the key. It runs one real lookup through
the same resolution an Agent call uses, including values not yet saved, and shows the provider's
own error on failure. Local extraction has nothing to configure or check.

Stored provider selections remain unchanged. A selected provider is the only request destination,
including when it uses a custom host. Exa and Jina reader calls allow 60 seconds each; Exa keyword
search retains its 25-second limit. Caller cancellation propagates without becoming a lookup error.

Any lookup failure, including a failed URL in an otherwise successful batch, stops new calls to
both `web_search` and `web_fetch` for the current turn. The tools share the Runtime's `web` failure
group. Already running requests may finish and contribute content; no retry, alternate query, or
provider switch is started after failure. Invalid tool arguments remain correctable before a
network request is made. A new user turn starts with both configured capabilities available again.

The failed tool result retains citable successful content and per-input diagnostics. The model is
instructed to answer from content already obtained and explain missing sources, or explain the
failure if no content was obtained. The Host persists these details in the ordinary error envelope;
the frontend retains successful sources for citation even when the tool part reports an error.
Network failures ask the user to check connectivity without drawing conclusions about a provider's
pricing or extraction capability. Other, non-web tools remain available.

## Local Extraction

The `fetch` provider reads a page on the device and is shown in settings as **Local extraction**.
It needs no account, key, or host, and sends the URL to no third party. It serves `web_fetch` only
and is never selected by default.

- **Download.** One `GET` without credentials to a public HTTP(S) hostname. URLs carrying
  credentials, IP literals, single-label hosts, and `localhost`, `.local`, or `.internal` names are
  rejected before any request. Redirects are followed manually, at most five, and each destination
  passes the same check. The whole chain shares 30 seconds and the body is capped at 1 MiB.
- **Accepted content.** HTML, XHTML, plain text, and Markdown, in UTF-8 only. A different charset
  declared by the response header or an early `<meta>` tag is a failure, not a best-effort decode.
- **Extraction.** HTML runs through linkedom, Readability, and Turndown with GFM tables inside the
  native JavaScript sandbox, limited to 5 seconds and 64 MB. Page HTML enters as a JSON value and
  is never evaluated; scripts, frames, forms, event handlers, and non-HTTP(S) links are removed
  from the result. Plain text and Markdown skip extraction.
- **Output.** At most 24,000 characters of Markdown per page, marked `truncated` beyond that,
  before the shared `web_fetch` limits below apply.
- **Concurrency.** One page is downloaded and extracted at a time across the app, so complete
  HTML documents do not accumulate in memory behind the sandbox.

Pages that build their content with client-side JavaScript have no main content in the downloaded
HTML and fail as an empty extraction; a remote reader is the choice for those. A client built
without the native sandbox reports the provider as unsupported on the platform. Both are ordinary
lookup failures under the stop policy above.

The bundled libraries live under `src/backend/services/webSearch/extraction/vendor`, each recorded
with its version, registry source, checksum, and license.

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

- Users need a provider outside the closed set. Decide the contract with desktop first; the
  provider vocabulary is shared.
- Mobile adopts desktop's provider fallback or excluded-domain list.
- A request needs defined arbitration between external and provider-native search.
