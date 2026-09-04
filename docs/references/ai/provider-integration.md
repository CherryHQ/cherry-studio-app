# AI Provider Integration

> Status: as-built.

This reference defines the mobile AI provider/model request architecture. Terms follow
[Domain Language](../domain-language.md).

The target ownership and staged migration for shared Provider connection facts are defined in
[Provider Serving Boundaries](./provider-serving-boundaries.md). This document continues to describe
the currently implemented runtime paths until each migration phase lands.

## Runtime Paths

Agent conversation requests use one path:

```text
MobileAgentHost -> PiRuntime -> piModelResolver -> provider/model services
```

Pi is the only local Agent Runtime. It receives a normalized Agent transcript and resolves the
selected Agent model through the Host-owned provider adapter. The current Pi binding supports
API-key-authenticated Anthropic Messages, Google Generate Content, OpenAI Chat Completions, and
OpenAI Responses endpoint families; other protocol or authentication families fail explicitly.

Model-backed application tools use this capability path:

```text
Mobile Agent Host → Pi Runtime → application-owned RuntimeTool
                                      ↓
                              capability service
                                      ↓
                         AiService / ai-core / AI SDK
```

Image generation uses this path today. Future model-backed capabilities use the same boundary but do
not need AI SDK unless their application adapter chooses it. Pi owns tool selection and iteration;
the capability service owns provider configuration, credentials, request execution, usage,
cancellation, output import, and cleanup. See
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
or reconciled, then stored locally for runtime use. Most fields are read from that projection.
Request-only registry facts that intentionally are not persisted, such as reasoning wire dialects
and service-tier delivery mappings, are rehydrated by `ProviderRegistryService` at request time.

`UniqueModelId` combines provider id and model id and is the runtime model identifier used by Agents,
paintings, and settings. Provider and Model shapes follow Cherry Desktop unless mobile has a
documented runtime compatibility reason to diverge.

## AI SDK Provider Resolution

`resolveProviderConnection()` is the shared, credential-selection-free connection resolver used by
Pi and AI SDK request construction. It resolves the effective endpoint, endpoint-scoped adapter
family, normalized wire model id, gateway provider-options key, and mobile/Provider request
headers. It does not select API keys or IAM/OAuth credentials. Because configured extra headers may
contain sensitive values, the result remains in memory and must not be persisted or logged.

For language models, Pi consumes the resolved connection through `resolvePiLanguageBinding()` and
requires a typed compatibility result before selecting a credential. AI SDK configuration consumes
the same connection facts directly while retaining its broader Provider and IAM projections. The
shared language transport policy is composed by both bindings where applicable. Image models
bypass the Pi binding.

`resolveProviderAiSdkConfig()` converts a Provider and Model into the configuration used by
`AiService`. Endpoint selection priority is:

1. `model.endpointTypes[0]`;
2. a registered per-model gateway route;
3. `provider.defaultChatEndpoint`;
4. no selected endpoint, after which base-URL lookup applies its documented compatibility fallback.

The endpoint and adapter-family logic chooses variants such as OpenAI, OpenAI-compatible, Azure,
Azure Responses, Azure Anthropic, Gemini, CherryIN, NewAPI, AiHubMix, or Gateway. Provider settings
builders are centralized in `src/backend/ai/provider/config.ts`.

`src/backend/ai/generation/aiSdk/AiSdkGenerator.ts` is a generate-only wrapper around the AI SDK.
Request assembly in `buildAgentParams.ts` supports explicit reasoning, sampling/provider overrides,
headers, timeouts, retries, and caller-supplied tools. It owns no conversation persistence or
stream lifecycle. AI SDK `ToolSet` is never the canonical Agent tool model: new Agent tool behavior
resolves through the application-owned `RuntimeTool` contract and a Pi adapter.

Endpoint declarations own wire-level behavior. `resolveEndpointDialect()` currently supplies the
stream-usage behavior for the selected endpoint, while `ProviderRegistryService` consumes the
reasoning-summary declaration when it builds the reasoning wire profile. OpenAI Responses
reasoning summary is default-off; the official OpenAI, Azure OpenAI, and OpenAI Codex endpoint
declarations opt into it explicitly. Mobile's explicit system-role compatibility policy still
controls developer-role behavior. Provider-level actual-cost reporting is projected to the current
persisted `apiFeatures` shape only when the registry declares it, so absent catalog facts do not
overwrite a newer persisted value with a generated default.

Service tier is also catalog-driven. `ProviderRegistryService.resolveServiceTierControl()` combines
the selected endpoint declaration with a model override, normalizes legacy persisted wire values to
semantic selections, and narrows the available options. Request assembly then maps the semantic
selection back to either an AI SDK provider-option namespace or a JSON request-body field. The
body-field path composes a cached fetch wrapper instead of adding Provider-id conditionals.

Mobile sends application instructions with the `system` role on OpenAI Chat Completions and OpenAI
Responses endpoints. The Pi bridge disables its URL/model-based developer-role inference, and the
native OpenAI AI SDK bridge sets `providerOptions.openai.systemMessageMode` to `system` after request
overrides are merged. Generic OpenAI-compatible adapters already preserve system messages. This is
a runtime-wide compatibility policy rather than a provider or model capability.

## Special Providers

CherryAI:

- resolves to `openai-compatible`;
- signs `/chat/completions` requests through the shared `ProviderLanguageTransportPolicy` consumed
  by Pi and AI SDK bindings;
- adds `X-Client-ID`, `X-Timestamp`, and `X-Signature`.

CherryIN uses the normal endpoint configuration and API-key path.

Mobile has no provider OAuth sign-in. Registry `authMethods` still mirrors the desktop catalog, but
OAuth-only preset providers are projected out by `MobileRegistryLoader.isProviderExcluded`.

Azure provider configuration handles OpenAI, Responses, and Anthropic variants. `iam-azure` auth
configuration and API-version settings influence the generated provider settings.

## Remote Registry Boundary

Mobile may fetch Desktop-published `models.json` and `provider-models.json` snapshots after an
explicit user action. The manifest must match the schema lane and the latest Desktop registry
semantics fully implemented by this Mobile Runtime. This compatibility number is independent of
the Mobile application version.

The snapshot is unsigned. `providers.json` therefore stays in the application bundle and cannot be
replaced remotely. This keeps endpoint routing and credential behavior inside the reviewed binary
while still allowing model metadata to be refreshed. Remote protocol support is not a substitute
for synchronizing schemas, interpreters, normalizers, or endpoint semantics: required behavior
consumed by Mobile must be implemented and validated, while unsupported optional behavior must be
explicitly classified, before the compatibility version advances.

The accepted semantic line is currently Desktop `2.0.8`. Desktop `2.0.9` remains gated on a full
Mobile compatibility review of the downloaded model and override payloads. Mobile does not need to
implement provider-native `serverTools` merely to consume newer model data: those optional fields
may be explicitly ignored while application-owned Web Search remains the only conversation search
path. The review must still prove that removal of the older per-model `web-search` capability does
not affect any Mobile consumer before the compatibility number advances.

## Transport

- Pi Agent requests use the Expo-compatible fetch supplied by `piModelResolver`.
- Pi and AI SDK request construction consume the same `ResolvedProviderConnection` facts before
  applying their client-specific URL formatting and credential materialization.
- Generic AI SDK provider configs rely on runtime/provider-package fetch behavior.
- CherryAI adds its shared signing transport policy over the selected client fetch.
- Painting image-edit requests inject Expo fetch for local image inputs.

## Reopen When

- Desktop Provider/Model semantics change.
- Pi provider coverage expands.
- A new model-capability tool needs provider configuration, usage, or artifact semantics not covered
  by the application capability boundary.
