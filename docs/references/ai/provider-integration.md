# AI Provider Integration

Status: **as-built Agent and legacy provider paths**.

This reference defines the mobile AI provider/model request architecture. Terms follow
[Domain Language](../domain-language.md).

## Runtime Path

The primary Agent chat request path is:

```text
MobileAgentHost -> PiRuntime -> piModelResolver -> provider/model services
```

Pi is the only local Agent Runtime. It receives a complete normalized Agent transcript and resolves
the selected Agent model through the Host-owned provider adapter.

The registered legacy Topic path remains during staged removal:

```text
ChatRuntime -> AiService -> providerToAiSdkConfig()
  ├─ pi     -> PiChatStreamAdapter -> Pi model layer
  └─ ai-sdk -> Agent -> @cherrystudio/ai-core / AI SDK
```

`EXPO_PUBLIC_CHAT_RUNTIME` selects only that legacy path. Development defaults to Pi; other builds
default to AI SDK. The Pi bridge temporarily reuses AI SDK provider-configuration shapes, but that
does not make AI SDK an Agent Runtime. The target Agent architecture has Pi as the sole local
conversation engine; AI SDK remains only where a non-Agent service or provider capability still
needs it.

`AiService` is a private, desktop-aligned backend AI implementation composed into workflow modules,
runtimes, and Data API handlers by bootstrap. It is not exposed through `Backend` or frontend
context. It supports:

- `streamText()`
- `generateText()`
- `listModels()`
- `generateImage()`
- `checkModel()`

`streamText()` requires a caller-provided AbortSignal. `ChatRuntime` owns each Topic's chat
AbortController; `PaintingGenerationSession` owns its generation AbortController and passes the
signal to `AiService` internally.

## Model Resolution

`ChatRuntime` resolves the model for a chat turn in this order:

1. The model selected for the turn.
2. `assistant.modelId`.
3. `chat.default_model_id`.

It then passes the resolved model to `AiService` as `uniqueModelId`. Direct `AiService` callers must
provide either `uniqueModelId` or an Assistant with `modelId`; `AiService` does not read the default
model preference. Assistant-less topics do not persist a default Assistant solely to resolve a model.

## Provider And Model Records

`ProviderService` reads and writes `user_provider` rows. A Provider owns:

- provider id and display name.
- API keys.
- auth config.
- default chat endpoint.
- endpoint configs.
- API feature flags.
- provider settings.
- order key and enabled state.

`ModelService` reads and writes `user_model` rows. Model metadata is resolved when the model is added or reconciled, then stored locally for runtime use. The runtime does not re-merge the provider registry on every AI request.

`UniqueModelId` combines provider id and model id and is the runtime model identifier used by chat and settings.

Provider and Model data shape follows Cherry desktop unless mobile has a documented runtime compatibility reason to diverge. Mobile may adapt how requests are executed through Expo, AI SDK, and mobile-owned services, but it should not invent different Provider/API key/model business semantics.

## Endpoint And Adapter Resolution

`providerToAiSdkConfig()` converts a Provider and Model into AI SDK provider config.

Endpoint selection priority is:

1. `model.endpointTypes[0]`.
2. `provider.defaultChatEndpoint`.
3. OpenAI chat completions fallback.

The endpoint and adapter-family logic chooses AI SDK provider variants such as OpenAI, OpenAI-compatible, Azure, Azure responses, Azure Anthropic, Gemini, CherryIN, NewAPI, AiHubMix, or Gateway.

Provider settings builders are centralized in
`src/backend/ai/provider/config.ts`.

## AI SDK Agent Adapter

`src/backend/ai/runtime/aiSdk/Agent.ts` keeps the desktop `Agent` filename but narrows
behavior to mobile AI SDK generate/stream calls.

Current exclusions:

- Desktop IPC handlers.
- Desktop IPC stream-manager session APIs beyond the mobile `ChatRuntime`.
- Pending message steering.
- Full agent-session orchestration.

These exclusions are mobile runtime scope limits, not a new Provider/Model domain model. If desktop Provider/Model schema or service semantics change, mobile should mirror the shared business behavior and then adapt it to the mobile request path.

## Transitional Pi Chat Adapter

`src/backend/ai/runtime/pi/PiChatStreamAdapter.ts` is the current migration bridge, not the final Pi
Agent Runtime. It accepts the resolved API key, base URL, model metadata, prompt, and generation
options; executes Pi; and maps Pi text, reasoning, usage, and terminal state into the existing
`UIMessageChunk` stream consumed by `ChatRuntime`.

The bridge currently supports API-key OpenAI Responses endpoints only. It rejects tools, MCP,
knowledge-base input, web search, custom endpoint paths, custom transports, and multi-step tool
loops. This adapter remains behind the legacy `ChatRuntime`; Agent chat instead uses the active
`PiRuntime` described in [Agent Runtime](../agent/agent-runtime.md).

## Provider Options

`AiService` merges:

- Assistant prompt.
- Assistant standard model parameters.
- Provider/model capability options.
- Provider-native web search options.
- Reasoning options.
- Image generation options.
- Custom provider parameters.
- Request headers, timeout, and retry settings.

Provider-native web search is an AI request option. It is separate from `WebSearchService`.

On the current AI SDK chat path, `buildAgentParams`
(`src/backend/ai/runtime/aiSdk/params/buildAgentParams.ts`) may also attach a tool set,
resolved per request by `ToolResolver.resolveForRequest`
(`src/backend/ai/tools/ToolResolver.ts`). The resolved tool set can contain the
external `web_search` tool backed by `WebSearchService`, MCP tools merged from
`McpRuntimeService.getToolEntriesForAssistant(...)`, and built-in device tools (calendar, health,
location, reminders under `src/backend/ai/tools/adapters/aiSdk/builtin`). When the external web search
path wins arbitration (see [Web Search](../web-search.md#web-search-in-ai-requests)), the request
carries the `web_search` tool; whenever tools are attached the request also sets
`stopWhen: stepCountIs(...)` (bounded by the assistant's max tool calls, default 20). External web
search and provider-native web search are mutually exclusive within one request; a request never
carries both.

This AI SDK tool attachment is transitional. New Agent tool behavior must resolve through an
application-owned `RuntimeTool` contract and a Pi adapter rather than making AI SDK `ToolSet` the
canonical tool model.

## Special Providers

CherryAI:

- Resolves to `openai-compatible`.
- Adds a provider-specific fetch wrapper that signs `/chat/completions` requests.
- Adds `X-Client-ID`, `X-Timestamp`, and `X-Signature`.
- Calls runtime `fetch` after adding signature headers.

CherryIN:

- Uses provider settings and endpoint routing through the normal provider config path.
- Authenticates with an API key like every other gateway provider.

Provider sign-in:

- Mobile has no provider OAuth sign-in. Every provider authenticates with an API key or with cloud
  IAM credentials.
- `authMethods` in the provider registry still carries `oauth` because it mirrors the desktop
  catalog verbatim. It describes what a provider supports, not what this app implements, so nothing
  in the app branches on it beyond `api-key`.
- Preset providers whose only auth path is OAuth (`copilot`, `openai-codex`, `grok-cli`) are
  projected out of every provider read by `MobileRegistryLoader.isProviderExcluded`.

Azure:

- Azure provider config handles OpenAI, responses, and Anthropic variants.
- `iam-azure` auth config and API version settings influence the generated provider settings.

## Fetch Transport

Both chat paths rely on Expo/React Native fetch behavior. The AI SDK path uses its provider
packages; the current Pi bridge supplies Expo fetch to Pi's stream function.

Current state:

- Generic provider configs do not inject a shared `fetch`.
- CherryAI has a provider-specific signing fetch wrapper.
- AI SDK requests otherwise rely on the fetch behavior provided by the runtime and provider packages.
- The Pi bridge uses Expo fetch and currently rejects provider configs with custom transports.
- Current device testing confirms this path streams incrementally.

## Reopen When

- Desktop Provider/Model semantics change.
- Mobile adds currently excluded agent-session or desktop-only stream-manager behavior.
- Pi provider coverage replaces the transitional AI SDK chat fallback.
