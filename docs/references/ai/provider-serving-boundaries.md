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
        |     +-- Pi binding (conversation and tool loop)
        |     `-- AI SDK binding (generateText and model checks)
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
- model capability, modality, limits, and pricing facts.

The Provider registry supplies catalog defaults. Runtime code must not create a second Provider-id
catalog to repeat these facts.

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

## Acceptance Criteria

- A standard compatible Provider can be added without editing Pi Provider-id dispatch code.
- Pi and AI SDK resolve the same endpoint, adapter family, wire model id, and Provider extra headers.
- Credentials are selected once at the owning request or connection boundary and never persisted in
  `ResolvedProviderConnection`.
- Unsupported protocol or authentication combinations fail explicitly before network execution.
- Adding a custom image transport does not require a language adapter change.
- Pi remains the sole local conversation Runtime.
