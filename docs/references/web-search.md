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
adapter table below. Each adapter is covered against the installed provider SDK over a scripted
transport; none has been exercised against a live provider.

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
never gain native tools. Compaction and budget-exhausted final responses suppress them as well.

Adapters, by the endpoint the model is actually requested on:

| Provider / endpoint | Search | Page reading | Sources shown | Boundaries |
| --- | --- | --- | --- | --- |
| OpenAI, Doubao, Bailian (Qwen3) / Responses | `web_search` | External service | URL annotations | No minimal reasoning |
| Azure OpenAI, Poe / Responses | `web_search_preview` | External service | URL annotations | No minimal reasoning; Poe for OpenAI models only |
| Grok / Responses | `web_search` and `x_search` | External service | URL annotations | |
| Anthropic / Messages | `web_search_20250305` | `web_fetch_20250910` | Result blocks and citations | Five uses per request |
| DeepSeek / Anthropic Messages | `web_search_20250305` | External service | Result blocks and citations | Its Responses endpoint ignores the tool |
| Gemini / Generate Content | `googleSearch` | `urlContext` | Grounding metadata | Beside functions from Gemini 3 only |
| Zhipu / Chat Completions | `web_search` tool entry | External service | Result list, no inline markers | |
| Bailian / Chat Completions | `enable_search` | External service | Result list when returned, no inline markers | |
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
follows it. `mobileProviderCatalog.ts` holds the two corrections: DeepSeek's endpoint, and Poe,
which documents web search for OpenAI bots on its Responses endpoint only. Remote model flags cannot
enable native tools. A host's `vendor/model` ID matches by the vendor ID behind its namespace, and a
host passes a tool through only for the vendor families its declaration names.

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

Current mobile provider ids are `zhipu`, `tavily`, `exa`, `exa-mcp`, `bocha`, `querit`, `jina`,
and `firecrawl`. SearXNG remains data-compatible but hidden from mobile settings and selectors.
The direct `fetch` provider is unsupported on mobile; old stored selections fail with an
unsupported-provider error rather than being silently rewritten.

Fresh installations retain hosted Exa MCP for keyword search (`web_search_exa`) and Jina Reader
for page reading, both without requiring a user API key. Exa MCP also supports page reading
(`web_fetch_exa`) when explicitly selected; its optional configured key uses `x-api-key`.
Both services handle page extraction remotely; mobile does not parse arbitrary HTML. The Exa adapter
accepts MCP JSON and SSE responses, preserves both `Highlights` and `Text` search content, and treats
protocol/tool errors as failures rather than empty successful searches.

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
- Additional native adapters or model IDs are reviewed, including a client-executed route for Kimi.
