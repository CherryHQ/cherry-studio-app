# Provider Serving Boundaries

Status: **Phases 1 and 2 landed (Phase 2 reshaped by the
[target architecture](./target-architecture.md)); Phase 3 started**.

This reference defines how Cherry Mobile shares Provider connection facts without turning image,
language, embedding, rerank, audio, or video execution into one universal adapter. It complements
[AI Provider Integration](./provider-integration.md), which remains the current runtime inventory.

## Decision

Cherry Mobile uses one Provider control plane and capability-specific execution planes:

```text
Provider + Model records
        |
        v
ResolvedProviderConnection
        |
        +-- Language serving
        |     +-- Pi binding (conversation, tool loop, and product chat checks)
        |     `-- AI SDK binding (generateText and SDK-only probes)
        |
        `-- Image serving
              `-- image parameters, edit input, transport, polling, and artifact handling
```

Image execution remains independent. It reuses Provider identity and connection facts, but it does
not consume a language request abstraction. Future embedding, rerank, audio, and video capabilities
follow the same rule: share connection facts, then own their request and result semantics.

Pi remains the sole local conversation Runtime. The AI SDK remains a non-conversation capability
adapter and must not become a second conversation or tool-loop owner.

## Ownership

### Provider and model records

The persisted Provider and Model rows remain authoritative for:

- Provider identity and preset lineage;
- endpoint configurations and default endpoint;
- model wire id and endpoint declarations;
- authentication method declarations;
- Provider extra headers and endpoint dialect;
- materialized request controls such as service-tier selection and available options;
- Provider-level cost-reporting trust declarations;
- model capability, modality, limits, and pricing facts.

The Provider registry supplies catalog defaults and remains authoritative for request-only wire
metadata that is deliberately not persisted, including reasoning dialects and service-tier delivery
mappings. The Runtime rehydrates those facts at request time. Runtime code must not create a second
Provider-id catalog to repeat them.

### `ResolvedProviderConnection`

The shared, credential-selection-free connection description owns facts that every capability can
derive in the same way:

- effective endpoint type and raw base URL;
- endpoint-scoped `adapterFamily`;
- gateway provider-options key, when present;
- normalized wire model id;
- mobile application headers merged with Provider extra headers.

It does not select API keys, OAuth tokens, or IAM credentials, and it does not own request
parameters, retries, timeouts, or stream state. Provider-configured extra headers may themselves
contain sensitive values, so the resolved object is ephemeral and must not be persisted or logged.
Selected credentials are materialized in memory by the capability executor at its existing request
or connection boundary so credential rotation and usage attribution keep one owner.

### Language serving

Language support is protocol-oriented, not Provider-id-oriented. Standard Providers should become
usable by declaring a supported endpoint and adapter family in the registry; adding a Provider must
not require another entry in a Pi-specific Provider table.

The provider layer owns the runtime-agnostic language control plane: `ResolvedProviderConnection`
plus the shared language transport policy. The typed Pi compatibility decision
(`resolvePiLanguageBinding`) lives with the Pi binding and consumes those facts; the provider layer
never sees the decision. System model support asks the bound Runtime through
`LanguageServingSupport`, so replacing the Runtime replaces that answer with it. AI SDK language
configuration and image models consume the connection facts directly.

Mobile's standard configurable chat protocol vocabulary lives in
`shared/utils/providerEndpoints.ts`. Forms and data integrity checks share it; it is not a Runtime
allowlist. Data checks configured routing references and preserves opaque desktop-compatible
endpoints outside that vocabulary. Pi derives its supported endpoints from its actual API adapter
map and still checks adapter family, authentication, and connection details independently.

Both settings `models.checkHealth()` and onboarding `models.checkChat()` probe the bound
conversation Runtime with no transcript or tools. Settings retains its selected API key, timeout,
cancellation, and incremental results. A probe key is an ephemeral request override; credential
selection still belongs to the binding, and neither traces nor persisted messages may contain it.
`AiService.checkModel()` remains an internal AI SDK text-generation probe and does not establish
chat readiness.

Pi selects the first API key through `ProviderService`'s per-provider round-robin cursor. When a
request fails before substantive content or a tool-call event is emitted, Pi tries every other
enabled key at most once within the request's shared 120-second waiting budget, in cyclic order
starting after the key that failed, and reports the last failure if none succeeds. Network failures,
provider timeouts, streams that end without a terminal event, and every HTTP or provider error switch
keys, including errors reported inside an HTTP 200 stream and failures to resolve a key's
credential. Only HTTP 400, or a
structured status or code of 400 when the response has no explicit error status, keeps the key,
because the request itself was rejected and would fail on every key; error text is never parsed.
Empty text/thinking events are buffered until content, a tool-call event, or successful completion
commits the response, and discarded when switching keys. Signed or redacted content remains
substantive even without visible text. The working key serves subsequent tool steps in the turn; a
later failure walks the full ring again from that key, so earlier failed keys are revisited. Keys
are never persistently disabled. Explicit probe-key overrides disable failover. Cancellation and
errors after substantive content or tool-call events do not advance keys.
The binding updates usage attribution to the serving key and redacts every candidate credential.
This policy belongs to Pi; non-conversation AI SDK and image calls retain their existing behavior.

The idle timer wraps the complete key-failover sequence and is the only request bound; the
provider SDK's own connection timeout is not configured. Credential switching, stream-start events,
and empty text/thinking events do not reset it, so the budget is identical for single-key and
multi-key providers: a request that keeps failing or produces no content ends after 120 seconds
total, rather than waiting 120 seconds per key. Once content events reach the caller, each event
resets the idle timer so ongoing generation can continue. Expiry ends the request and aborts the
active transport without trying another key. Cancellation, source creation/iteration failures, and
streams closed without a terminal event all settle the final result, including when source creation
is still pending or the source ignores cancellation. Tool execution is outside this timer; each
subsequent model request starts a fresh budget.

Provider-configured authentication headers disable Pi key failover and leave credential attribution
unknown, because the selected API key may not be the credential serving the request. Each Pi adapter
declares the relevant header names: `Authorization` for all supported protocols, plus `x-api-key`
for Anthropic, `x-goog-api-key` for Google, and `api-key` for Azure. Matching is case-insensitive and
includes empty values, which can suppress SDK-generated authentication. These headers remain
unchanged and redacted; unrelated custom headers do not disable failover.

Device interconnection already exports the full enabled API-key list, including IDs and labels.
Mobile provider imports preserve that list and its order, so imported keys participate in the same
rotation and failover policy without a separate synchronization protocol.

The Pi binding owns only Pi mechanics:

- endpoint/protocol family to Pi API-family mapping;
- Pi-specific base URL formatting;
- `PiModel` construction and `streamFn` loading;
- Pi context, reasoning, tools, events, cancellation, and usage conversion.

The AI SDK binding owns only AI SDK mechanics:

- AI SDK Provider selection and settings construction;
- SDK-specific auth materialization and request hooks;
- provider-options namespaces and generation parameters;
- AI SDK result, error, and usage behavior.

Provider-specific auth, header, or JSON-body behavior that both bindings need should be promoted to
a shared transport policy. Do not promote an SDK-specific workaround merely because it names a
Provider.

### Image serving

Image generation keeps its existing independent pipeline:

- creator/model metadata declares provider-neutral parameter support;
- Provider-model overrides declare Provider delivery routing;
- the image executor owns generate/edit inputs, canonical parameter splitting, vendor options,
  submit/poll/cancel behavior, downloads, and managed artifacts.

AI SDK text and image requests share only `resolveAiSdkServing`, which returns the connection,
selected credentials, and wire model and carries no request parameters. `AiService.generateImage`
builds image parameters from that result, and `AiImageRequest` accepts transport options only. Text
options such as `systemMessageMode`, `store`, and reasoning or service-tier controls must not be
merged into image requests.

An image-only transport must not be added to the language binding. A language-only transport must
not acquire image parameter or artifact responsibilities.

## Compatibility Rules

Provider onboarding should follow this matrix:

| Provider behavior | Required implementation |
| --- | --- |
| Existing language protocol and ordinary API-key auth | Registry/provider data only |
| Existing protocol with Provider-specific shared request shaping | One shared transport policy |
| A genuinely new language wire protocol | A binding in each Runtime that can speak it; unsupported Runtimes fail explicitly |
| A non-standard image API | One image transport; no language adapter change |

Full execution unification is intentionally not a goal. Pi and AI SDK use different model objects,
base-URL conventions, tool and reasoning representations, stream events, and error contracts.
Those projections remain explicit and small.

## Mobile And Desktop Relationship

Cherry Desktop is a semantic reference for:

- one authoritative owner per Provider fact;
- the `provider.id` -> `endpointType` -> `adapterFamily` identity stack;
- Runtime drivers owning native mechanics rather than Provider catalogs;
- image metadata and delivery transport remaining capability-specific.

Mobile does not copy Desktop's local HTTP API Gateway as the default Pi bridge. A loopback server
adds lifecycle, authentication, protocol-conversion, and suspension costs that are materially
different on iOS and Android. Any future in-process AI SDK bridge requires a separate design and
must prove tool calls, reasoning, images, usage, cancellation, and error parity before adoption.

Mobile's remote registry protocol is a model-data distribution mechanism, not a replacement for
the shared control plane. Unsigned snapshots may update model metadata and Provider-model
overrides, including selecting an endpoint type already declared by the bundled Provider and
updating image-generation `vendorTransport` relative paths and sync/async behavior. Provider
definitions, base URLs, adapter families, headers, and credential behavior remain bundled. Mobile
may accept a Desktop snapshot only after its schemas and Runtime interpreters implement that
snapshot's semantics.

## Migration

### Phase 1: shared connection facts — landed

`resolveProviderConnection()` now owns the effective endpoint, adapter family, normalized wire
model id, and common request headers consumed by Pi and AI SDK request construction. Existing
credential selection and capability executors remain unchanged.

### Phase 2: language serving materialization — landed, reshaped

The typed supported-or-unsupported Pi binding is classified before credential selection or network
execution, with stable compatibility codes and unchanged user-facing messages. The plan wrapper was
later dissolved by the target architecture: the decision (`resolvePiLanguageBinding`) moved into
the Pi adapter, the provider layer keeps only runtime-agnostic facts, and system model support
reaches the decision through the Runtime binding (`LanguageServingSupport`). Native model/config
projections remain client-specific.

Credential selection and its non-secret receipt still belong to the binding that materializes the
credential because AI SDK supports IAM paths that Pi cannot execute. A later slice may share an
API-key credential materializer if it removes real duplication without selecting unnecessary keys
for IAM Providers.

### Phase 3: shared transport policies — started

`ProviderLanguageTransportPolicy` is the shared backend boundary for Provider-specific language
HTTP behavior. The first policy owns CherryAI request signing and is composed over the AI SDK fetch
or Pi's Expo-compatible fetch. Provider matching includes preset lineage so a cloned Provider
receives the same transport behavior. It is not applied to image execution, and SDK-only request
hooks remain in the owning binding.

Further policies should be added only after identifying Provider-specific header, credential, or
payload transformations that multiple language bindings actually need.

Endpoint-dialect, reasoning-wire, service-tier, and actual-cost facts are now declared in the
registry and consumed by the Mobile request path. The compatibility projection into persisted
`apiFeatures` is intentionally sparse: it projects only explicit declarations so schema defaults
cannot silently replace newer local state. Full Desktop registry admission remains blocked on a
catalog compatibility review; provider-native server tools stay outside the current Mobile product
scope and do not need a Pi implementation merely to admit otherwise compatible model data.

## Acceptance Criteria

- A standard compatible Provider can be added without editing Pi Provider-id dispatch code.
- Pi and AI SDK resolve the same endpoint, adapter family, wire model id, and Provider extra headers.
- Credentials are selected once at the owning request or connection boundary and never persisted in
  `ResolvedProviderConnection`.
- Unsupported protocol or authentication combinations fail explicitly before network execution.
- Adding a custom image transport does not require a language adapter change.
- Pi remains the sole local conversation Runtime.
