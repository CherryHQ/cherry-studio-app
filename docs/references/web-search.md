# Web Search

This reference defines selection between provider-native web tools and the external web-search
service. Terms follow [Domain Language](./domain-language.md).

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
external providers globally and share one source preference. The selected route is frozen before
the model request; a failed request never starts an automatic alternate-provider attempt.

## Native Tools And Selection

Native tools run inside the Pi Durable conversation loop for every provider endpoint in the
adapter table below. Scripted-transport regression cases cover these adapters; the Qwen additions
have not yet been run. Live-provider acceptance remains separate.

`chat.web_search.model_tools_preferred` defaults to true on new installs. Seeding preserves the
external-first behavior of existing installations and never overwrites a saved choice. The setting
is global across keyword search and page reading; it does not enable a disabled Agent capability
or force the model to search on every message.

The Host freezes external configuration readiness and the preference in `TurnPlan.webTools` and
passes them in the conversation configuration. Pi resolves the model, trusted Provider identity
(including copied presets), endpoint, and authentication method, then selects one route per
capability: the preferred available path, then the other path, then no tool. The route is stored
with the configuration, so a queued input, a retried request, and a request recovered after a
restart all use it; like the tool set, it cannot change while the conversation is busy. A capability
reaches the model through one route only: its external function is withheld when the native tool is
selected. Each request intersects the stored route with the credentials it actually resolved.

Configuration readiness is local and makes no health-check request. Explicit denies and per-call
approvals cannot be bypassed by a native tool. Requests without Host web policy, including probes,
never gain native tools. Compaction requests suppress them as well.

Adapters, by the endpoint the model is actually requested on:

| Provider / endpoint | Search | Page reading | Sources shown | Boundaries |
| --- | --- | --- | --- | --- |
| OpenAI, Doubao, Qwen AI Platform (Qwen3 and hosted GLM/Kimi) / Responses | `web_search` | External service | URL annotations | No minimal reasoning |
| Azure OpenAI, Poe / Responses | `web_search_preview` | External service | URL annotations | No minimal reasoning; Poe for OpenAI models only |
| Grok / Responses | `web_search` and `x_search` | External service | URL annotations | |
| Anthropic / Messages | `web_search_20250305` | `web_fetch_20250910` | Result blocks and citations | Five uses per request |
| DeepSeek / Anthropic Messages | `web_search_20250305` | External service | Result blocks and citations | Its Responses endpoint ignores the tool |
| Gemini / Generate Content | `googleSearch` | `urlContext` | Grounding metadata | Beside functions from Gemini 3 only |
| Zhipu / Chat Completions | `web_search` tool entry | External service | Result list, no inline markers | |
| Qwen AI Platform / Chat Completions | `enable_search` | External service | Result list when returned, no inline markers | |
| QwenCloud / Chat Completions | `enable_search`, model-specific strategy | External service | No sources in the documented Chat API | Shared endpoint-specific eligibility; no forced search |
| QwenCloud / Responses | `web_search` | External service | URL annotations | Only the published hosted-model declarations |
| Qwen AI Platform, QwenCloud / Anthropic Messages | `web_search_20250305` | `web_fetch_20250910` | Result blocks and citations | Required system identifier; fetch requires search; exact supported SKUs |
| OpenRouter / Chat Completions | `openrouter:web_search` | External service | URL annotations | All chat models |
| Perplexity / Chat Completions | Built into Sonar | External service | Numbered citations | Nothing is added to the request |
| CherryIN, AiHubMix, New API | The vendor's tool on its own endpoint | Claude and Gemini only | As the vendor | Chat Completions endpoint stays external |
| Kimi | External service | External service | | See below |
| Every other endpoint | External service | External service | | |

A model is eligible only when the trusted bundled catalog lists it for that provider. A sign-in
uses native tools only when it authenticates the provider's ordinary API (xAI, OpenRouter);
subscription sign-ins keep the external services. Vertex AI, Bedrock, and Azure Chat Completions
are not served by Pi on Mobile and have no adapter.

Kimi's search is not a provider-executed tool. The client must run a platform formula with the
provider credential and return its encrypted output to the model verbatim, and the older
`$web_search` round trip is scheduled for removal. Neither fits the native route, so Kimi keeps the
external service.

DeepSeek support differs by endpoint. As checked on 2026-10-12, its
[Responses compatibility contract](https://api-docs.deepseek.com/guides/responses_api/)
lists `web_search` as ignored, while its
[Claude Code integration guide](https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code/)
documents native web search through the Anthropic-compatible API. The published declaration names
the Responses endpoint, which conflicts with that contract; Mobile declares the Anthropic endpoint.

The published `@cherrystudio/provider-registry` package owns the `serverTools` declarations, the
per-provider model eligibility, and the models that accept functions beside a native tool; Mobile
passes the actual endpoint to its eligibility query. `mobileProviderCatalog.ts` holds the two corrections: DeepSeek's endpoint, and Poe,
which documents web search for OpenAI bots on its Responses endpoint only. Remote model flags cannot
enable native tools. A host's `vendor/model` ID matches by the vendor ID behind its namespace, and a
host passes a tool through only for the vendor families its declaration names.

Qwen Anthropic requests prepend the documented client identifier only when native web tools are
selected, preserving system text and cache controls. Native page reading requires native search
in the same request; when search needs approval or is denied, page reading falls back to the
external reader or is unavailable. Returned `urls` and `goal` inputs remain intact in the stored
provider content. The package owns model membership; Pi additionally restricts the documented
DeepSeek dated aliases and keeps hosted GLM/Kimi off the mainland Chat search switch. See the
[QwenCloud web-search contract](https://docs.qwencloud.com/developer-guides/tool-calling/web-search).

Gemini before 3 rejects functions beside its native tools: the selector keeps the other functions
and falls back to external web tools, or chooses one compatible web source with the most available
capabilities. Gemini 3 accepts the combination with `toolConfig.includeServerSideToolInvocations`,
which returns server-side tool parts that must be sent back with their signatures on every later
request. Pi's history does not model those parts, so they are stored with the message and returned
to their place in later payloads for the same model. See the official
[tool combination contract](https://ai.google.dev/gemini-api/docs/generate-content/tool-combination).

Anthropic responses retain their complete content blocks, including signed thinking, streamed
tool inputs, encrypted search results and fetched documents. Later requests to the same provider
and model restore the original assistant content before sending client tool results, so a server
tool deferred behind a parallel function call can run. A deferred call that can no longer run,
because web tools were withdrawn or the turn moved on without it, is omitted from the restored
content. A response cut off inside a tool call is not restored; later requests carry its answer
text and source facts. A `pause_turn` response is continued as-is with the same tools, at most
five times per model invocation. Continued text keeps its streaming offsets, citations and
accumulated usage; exceeding the limit ends with an error and preserves the partial answer. The
five-use tool cap limits each provider request but does not prevent pauses. Each natively fetched
page is limited to 4,000 tokens, the external reader's per-page allowance, because restored
documents count as input on every later request.
Anthropic splits an answer into one text block per citation; the fragments are shown as one
continuous text. See [Anthropic's server-tool lifecycle](https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools).

Minimal Agent mode permits provider-native web search and page reading under the same web policy
as standard mode, while omitting application tools, Skills and plugins. It has no external-service
fallback. A disabled web capability withholds native web tools in both modes.

Pi uses `onPayload` and `onProviderStreamEvent` on its existing stream. Each adapter's source
metadata is attached to the terminal assistant message Pi persists, so sources share that message's
durability and are projected again after a restart. Original signed
model text remains unchanged: the display text with `[cite:id]` markers is stored beside it, and an
additional source-facts text block, never displayed, keeps URLs in Pi replay. Fallback history also
retains source facts. Native citations open their URLs, source cards remain available, and document
export converts the same IDs to links. Google-supplied search suggestions are stored separately and
displayed in an isolated WebView with scripts disabled; they are never sent back to the model as
page content.

OpenAI validates a replayed reasoning item against the output item that followed it. Pi's history
keeps reasoning items but has no block for a search call, so each `web_search_call` or
`x_search_call` that followed a reasoning item is stored with the message and returned to its place
in later request payloads.

Native search activity commits the credential attempt before answer text arrives, preventing
failover from repeating billable work, and renews the stream idle timer. Recoverable native lookup
failures preserve successful sources, add an inline error, and disable both web routes for the rest
of the turn; unrelated tools and the answer continue. The failure is read from the stored turn, so
it still applies after recovery. Whole-request failures remain Pi failures. Cancellation aborts the
same transport; a stopped answer keeps its partial text without sources. There is no automatic
switch after failure. Provider-internal searches do not consume Mobile's local function-call counter; those
limits cannot bound server-internal search counts or charges. Provider usage may omit tool fees.

Search result count and compression settings apply only to external services. Native tools use
their provider's defaults and billing, and the model decides when to search: no adapter forces a
search on every message. See the official
[OpenAI](https://developers.openai.com/api/docs/guides/tools-web-search),
[Gemini search](https://ai.google.dev/gemini-api/docs/google-search),
[Gemini URL context](https://ai.google.dev/gemini-api/docs/url-context),
[Anthropic](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool),
[xAI](https://docs.x.ai/developers/tools/web-search),
[Zhipu](https://docs.bigmodel.cn/cn/guide/tools/web-search),
[Bailian](https://help.aliyun.com/zh/model-studio/web-search),
[OpenRouter](https://openrouter.ai/docs/guides/features/server-tools/web-search), and
[Poe](https://creator.poe.com/docs/external-applications/openai-compatible-api) contracts.

## External Runtime

```text
WebSearchService -> mobile provider adapter -> @cherrystudio/web-search -> mobile HTTP transport
                 -> mobile post-processing with shared content slicing
```

`WebSearchService` lives under `src/backend/services/webSearch` and reads preferences through
`PreferenceService`. Bootstrap keeps it private. Frontend settings reach provider health checks
through the narrow `webSearch` workflow module and reach configuration through `PreferenceClient`.

The shared `@cherrystudio/web-search` package owns remote provider metadata, request formats,
authentication formats, response validation, protocol errors, and result conversion. Mobile pins
an exact package version and imports each provider through its public entry. It does not copy
Desktop source or use Desktop source aliases. Protocol fixtures and protocol tests live upstream;
Mobile tests cover its transport, configuration, credentials, capability selection, and policies.

`mobileWebSearchTransport` uses the existing `createHttpClient` with text responses and all HTTP
statuses returned to the package. Serialized bodies and URL paths/queries pass through unchanged;
the package parses responses. Network errors, response-body deadlines, and cancellation stay with
the mobile transport. The adapter preserves structured errors in the existing per-input failure
envelope, including upstream codes and HTTP status.

Runtime behavior:

- selects a provider by requested capability;
- builds runtime configuration from preferences;
- executes one request per normalized keyword or URL using only the selected provider;
- returns successful results alongside failed inputs, retaining error kind, message, and available
  status/code even when every input fails;
- logs failures with their provider and capability; it never retries a failed lookup or switches
  providers;
- bounds fetched page content and applies configured search-result compression;
- propagates caller aborts.

## Provider Registry

The provider set is closed. Remote presets derive from the shared catalog and an explicit Mobile
capability allowlist; the registry selects their shared protocol modules. A single mobile adapter
binds those protocols to the application, with Jina's region/retry policy kept separately. Local
`fetch` remains mobile-owned. Users choose providers and supply credentials through settings
derived from these presets. Provider ids, preset shape, and preference keys remain aligned with
Cherry Studio desktop.

| Provider | Search | Page reading | Credentials |
| --- | --- | --- | --- |
| `zhipu` | yes | | Zhipu model provider key |
| `tavily`, `exa`, `bocha`, `parallel`, `serply`, `searchapi`, `desearch` | yes | | API key required |
| `querit`, `deepseek` | yes | yes | API key required |
| `exa-mcp` | yes | yes | none; uses the `exa` key when one is set |
| `jina` | yes | yes | API key required to search, optional to read pages |
| `firecrawl` | yes | yes | API key optional |
| `searxng` | yes | | self-hosted address; optional basic auth |
| `crawl4ai` | | yes | self-hosted address with optional token; Cloud requires a key |
| `fetch` | | yes | none; see [Local Extraction](#local-extraction) |

Each preset capability declares `requiresApiHost` and `requiresApiKey`. Configuration readiness
and request execution share these checks, so a hostless local reader is available immediately
and Jina requires a key only for keyword search. Host-specific protocol requirements, such as
Crawl4AI Cloud's API key, are additionally checked by the shared protocol before sending its
request. SearXNG has no default address, unlike desktop, because a phone has no local instance
to reach.

Fresh installations retain hosted Exa MCP for keyword search (`web_search_exa`) and Jina Reader
for page reading, both without requiring a user API key. Exa MCP also supports page reading
(`web_fetch_exa`) when explicitly selected; its optional key uses `x-api-key`.
Both services handle page extraction remotely. The Exa adapter is a fixed HTTP adapter for that
one hosted service, not a general MCP client: it accepts MCP JSON and SSE responses, preserves
both `Highlights` and `Text` search content, and treats protocol/tool errors as failures rather
than empty successful searches.

Jina's built-in addresses follow the device: a device whose region is mainland China, or whose
time zone is Shanghai or Urumqi, uses Jina's mainland mirror (`s.jinaai.cn`, `r.jinaai.cn`), and
any other device uses the global hosts. Device settings only guess at what the network can reach,
so when the chosen host cannot be connected to, the request is sent once to the other. A timeout
or an answer from the service is not retried, and an address the user entered is used as is.

SearXNG returns the instance's result snippets and sends the configured engine list only when one
is stored; it does not read each result page. Several API keys rotate per provider across lookups,
over distinct keys.

SearchApi uses the shared Google-search protocol with the configured result limit, API key, and
optional custom address. It appears only on the Web search page; it does not read pages.

Querit accepts configured addresses with or without `/v1`. A page marked failed in its response
statuses remains a failed input even when the response includes content; successful pages in the
same Mobile batch remain available. Crawl4AI uses `/scrape` for
`crawl4ai.com` and its subdomains, and `/md` for self-hosted instances. These protocol choices are
owned by the shared package.

Mobile retains Exa MCP page reading, hostless local extraction, mandatory page-content budgets,
and failure stopping. It does not adopt Desktop's automatic alternate-provider attempts or
SearXNG engine discovery/page enrichment. Those would change request counts and failure behavior.

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
including when it uses a custom host; Jina's two built-in hosts are the same provider. Exa and
Jina reader calls allow 60 seconds each; Exa keyword search retains its 25-second limit. Caller
cancellation propagates without becoming a lookup error.

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
- Additional native adapters or model IDs are reviewed, including a client-executed route for Kimi.
