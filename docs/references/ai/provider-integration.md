# AI Provider Integration

Status: **as-built Agent and provider-service paths**.

This reference defines the mobile AI provider/model request architecture. Terms follow
[Domain Language](../domain-language.md).

## Runtime Paths

Agent conversation requests use one path:

```text
MobileAgentHost -> PiRuntime -> piModelResolver -> provider/model services
```

Pi is the only local Agent Runtime. It receives a normalized Agent transcript and resolves the
selected Agent model through the Host-owned provider adapter. Provider coverage beyond the current
OpenAI Responses-compatible Pi adapter is separate follow-up work.

When application tools land, the capability path is:

```text
Mobile Agent Host → Pi Runtime → application-owned RuntimeTool
                                      ↓
                              capability service
                                      ↓
                         AiService / ai-core / AI SDK
```

Image generation is the first intended use of this path. Office generation and managed-file edits
use the same tool boundary but do not need AI SDK unless their application capability chooses it.
Pi owns tool selection and iteration; the capability service owns provider configuration,
credentials, request execution, usage, cancellation, output import, and cleanup. See
[Agent Tools And Controlled Resources](../agent/agent-tools-and-resources.md).

`AiService` remains a private, desktop-aligned backend adapter for non-conversation operations:

- `generateText()` for short internal generations such as Session naming;
- `listModels()` and `checkModel()` for provider settings;
- `generateImage()` for painting jobs.

It is not exposed through `Backend` or frontend context. Every request supplies an explicit
`uniqueModelId`; `AiService` does not resolve an Assistant, Topic, or default-model fallback.

## Provider And Model Records

`ProviderService` reads and writes `user_provider` rows. A Provider owns its display name, API keys,
auth config, endpoint configs, feature flags, settings, ordering, and enabled state.

`ModelService` reads and writes `user_model` rows. Model metadata is resolved when the model is added
or reconciled, then stored locally for runtime use. The runtime does not re-merge the provider
registry on every request.

`UniqueModelId` combines provider id and model id and is the runtime model identifier used by Agents,
paintings, and settings. Provider and Model shapes follow Cherry Desktop unless mobile has a
documented runtime compatibility reason to diverge.

## AI SDK Provider Resolution

`resolveProviderAiSdkConfig()` converts a Provider and Model into the configuration used by
`AiService`. Endpoint selection priority is:

1. `model.endpointTypes[0]`;
2. `provider.defaultChatEndpoint`;
3. OpenAI chat completions fallback.

The endpoint and adapter-family logic chooses variants such as OpenAI, OpenAI-compatible, Azure,
Azure Responses, Azure Anthropic, Gemini, CherryIN, NewAPI, AiHubMix, or Gateway. Provider settings
builders are centralized in `src/backend/ai/provider/config.ts`.

`src/backend/ai/runtime/aiSdk/Agent.ts` is now a generate-only wrapper around the AI SDK. Request
assembly in `buildAgentParams.ts` supports explicit reasoning, sampling/provider overrides, headers,
timeouts, retries, and caller-supplied tools. It owns no conversation persistence or stream
lifecycle. AI SDK `ToolSet` is never the canonical Agent tool model: new Agent tool behavior
resolves through the application-owned `RuntimeTool` contract and a Pi adapter.

Mobile sends application instructions with the `system` role on OpenAI Chat Completions and OpenAI
Responses endpoints. The Pi bridge disables its URL/model-based developer-role inference, and the
native OpenAI AI SDK bridge sets `providerOptions.openai.systemMessageMode` to `system` after request
overrides are merged. Generic OpenAI-compatible adapters already preserve system messages. This is
a runtime-wide compatibility policy rather than a provider or model capability.

## Special Providers

CherryAI:

- resolves to `openai-compatible`;
- signs `/chat/completions` requests with its provider-specific fetch wrapper;
- adds `X-Client-ID`, `X-Timestamp`, and `X-Signature`.

CherryIN uses the normal endpoint configuration and API-key path.

Mobile has no provider OAuth sign-in. Registry `authMethods` still mirrors the desktop catalog, but
OAuth-only preset providers are projected out by `MobileRegistryLoader.isProviderExcluded`.

Azure provider configuration handles OpenAI, Responses, and Anthropic variants. `iam-azure` auth
configuration and API-version settings influence the generated provider settings.

## Transport

- Pi Agent requests use the Expo-compatible fetch supplied by `piModelResolver`.
- Generic AI SDK provider configs rely on runtime/provider-package fetch behavior.
- CherryAI adds its signing fetch wrapper.
- Painting image-edit requests inject Expo fetch for local image inputs.

## Reopen When

- Desktop Provider/Model semantics change.
- Pi provider coverage expands.
- Agent tools or attachments gain an application-owned runtime contract.
- A new model-capability tool needs provider configuration, usage, or artifact semantics not covered
  by the application capability boundary.
