# Cherry Mobile AI Provider Integration

Status: current

This document defines the current mobile AI provider/model request architecture. Terms follow [CONTEXT.md](../../CONTEXT.md).

## Runtime Path

The request path is:

`ChatSession -> AiService -> providerToAiSdkConfig() -> Agent -> @cherrystudio/ai-core / AI SDK`

`AiService` is backend infrastructure composed behind the `MobileBackend` contracts. It supports:

- `streamText()`
- `generateText()`
- `listModels()`
- `generateImage()`
- `checkModel()`

`streamText()` requires a caller-provided AbortSignal. `ChatSession` owns the chat AbortController;
`PaintingGenerationSession` receives the frontend-owned generation signal through its contract.

## Model Resolution

Model selection priority is:

1. Explicit `uniqueModelId`.
2. `assistant.modelId`.
3. `chat.default_model_id`.

Assistant-less topics do not persist a default assistant id just to resolve a model. They read the default model preference at send time.

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
`src/backend/infrastructure/ai/provider/config.ts`.

## AI SDK Agent Adapter

`src/backend/infrastructure/ai/runtime/aiSdk/Agent.ts` keeps the desktop `Agent` filename but narrows
behavior to mobile AI SDK generate/stream calls.

Current exclusions:

- Desktop IPC handlers.
- Stream manager sessions.
- Pending message steering.
- Full agent-session orchestration.

These exclusions are mobile runtime scope limits, not a new Provider/Model domain model. If desktop Provider/Model schema or service semantics change, mobile should mirror the shared business behavior and then adapt it to the mobile request path.

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

Beyond provider options, `buildAgentParams`
(`src/backend/infrastructure/ai/runtime/aiSdk/params/buildAgentParams.ts`) may also attach a tool set,
resolved per request by `ToolService.resolveForRequest`
(`src/backend/infrastructure/ai/tools/ToolService.ts`). The resolved tool set can contain the
external `web_search` tool backed by `WebSearchService`, MCP tools merged from
`McpService.getToolEntriesForAssistant(...)`, and built-in device tools (calendar, health, location,
reminders under `src/backend/infrastructure/ai/tools/adapters/aiSdk/builtin`). When the external web
search path wins arbitration (see [Web Search](./mobile-web-search.md#web-search-in-ai-requests)), the
request carries the `web_search` tool; whenever tools are attached the request also sets
`stopWhen: stepCountIs(...)` (bounded by the assistant's max tool calls, default 20). External web
search and provider-native web search are mutually exclusive within one request; a request never
carries both.

## Special Providers

CherryAI:

- Resolves to `openai-compatible`.
- Adds a provider-specific fetch wrapper that signs `/chat/completions` requests.
- Adds `X-Client-ID`, `X-Timestamp`, and `X-Signature`.
- Calls runtime `fetch` after adding signature headers.

CherryIN:

- Uses provider settings and endpoint routing through the normal provider config path.
- Provider settings UI exposes an OAuth card only for `provider.id === "cherryin"`.
- OAuth uses Expo AuthSession with PKCE against `https://open.cherryin.ai`.
- OAuth token state is stored in the CherryIN provider `authConfig` as OAuth credentials.
- OAuth-derived gateway keys are stored in the same provider `apiKeys` array as manual keys and labeled `OAuth`.
- This mirrors desktop Cherry Studio: OAuth keys are ordinary provider API key entries with `id`, `key`, `label`, and `isEnabled`; runtime key selection filters by enabled state, not by label.
- The `OAuth` label is only ownership metadata for CherryIN OAuth flows, especially logout cleanup.
- Logout clears token state and removes OAuth-labeled keys.

Azure:

- Azure provider config handles OpenAI, responses, and Anthropic variants.
- `iam-azure` auth config and API version settings influence the generated provider settings.

## Fetch Transport

ADR 0004 records the decision to rely on the Expo/React Native runtime fetch behavior for AI SDK chat streaming.

Current state:

- Generic provider configs do not inject a shared `fetch`.
- CherryAI has a provider-specific signing fetch wrapper.
- AI SDK requests otherwise rely on the fetch behavior provided by the runtime and provider packages.
- Current device testing confirms this path streams incrementally.

## Reopen When

- Desktop Provider/Model semantics change.
- Mobile adds currently excluded agent-session or stream-manager behavior.
