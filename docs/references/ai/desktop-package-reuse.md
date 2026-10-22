# Desktop AI Reuse

Status: **Mobile now declares published `@cherrystudio/ai-core@2.4.2` and
`@cherrystudio/ai-sdk-provider@0.1.9` in place of local source packages; Expo and device acceptance
of those artifacts is pending. Mobile does not mirror Desktop's conversation Runtime.
Mobile consumes `@cherrystudio/provider-registry@0.2.3` for catalog schemas, queries, and trusted
provider data. Mobile retains its loader, product extensions, and persisted-data projection.
The registry compatibility baseline remains `2.1.4`; device acceptance is separate from package
and Metro checks.**

This reference defines what Mobile may reuse from Cherry Desktop. A Desktop implementation is a
source of behavior to assess, not a tree to copy. Every port needs a concrete Mobile consumer and
must fit one of Mobile's existing execution boundaries.

## Decision

Mobile has two AI execution paths:

- Conversation turns run on `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai` under
  `src/backend/ai/agent/runtime/pi`.
- Non-conversation text generation, SDK-only probes, model listing, and image generation run through
  `AiService` and the AI SDK.

Desktop code is admitted only when all of the following are true:

1. A current Mobile production path consumes the behavior.
2. The behavior belongs to Pi, `AiService`, or the shared provider connection layer without moving
   ownership between those paths.
3. The dependency closure is React Native safe and does not expose Node or Electron code to Metro.
4. The smallest useful implementation and its behavior tests can be ported without importing
   unused Desktop Runtime infrastructure.
5. Provider registry compatibility advances only after Mobile validates every semantic field it
   consumes and explicitly classifies unsupported optional fields as ignored product capabilities.

| Desktop surface | Mobile treatment |
| --- | --- |
| `@cherrystudio/ai-core` | Consume the published package through `AiService` and its provider/tool adapters; keep Mobile conversation execution in Pi |
| `@cherrystudio/ai-sdk-provider` | Consume the published CherryIN and OpenAI-compatible provider package through Mobile's AI SDK path |
| `@cherrystudio/provider-registry` | Consume the published package; retain Mobile snapshot loading, provider extensions, and persisted-data compatibility |
| Desktop custom providers and image transports | Port reusable wire behavior into Mobile's private `@cherrystudio/ai-runtime` when an existing Mobile feature consumes it |
| Desktop Pi Runtime | Do not consume it directly; Mobile owns its Pi host, adapters, persistence, tools, and lifecycle |
| `@cherrystudio/dsh-bridge` | Desktop-only |

Desktop UI and table packages are outside this AI Runtime decision and require separate React
Native and ownership assessments.

## Published AI SDK Reuse

### `@cherrystudio/ai-core`

Mobile imports the published `ai-core` package through the private implementation behind
`AiService`. Production consumers use provider construction, SDK-specific text/model probes,
model discovery and image generation. Translation and session naming instead use the bound Pi
`RuntimeTextGenerator`, as described in [Provider Integration](./provider-integration.md). `packages/ai-runtime` owns Mobile's provider configuration
types that the published package does not expose.

The published package also contains Desktop context and Agent helpers. They have no Mobile
conversation consumer: that execution and context are owned by
`src/backend/ai/agent/runtime/pi/`. New versions must still be reviewed against the consumed
exports, patched AI SDK dependencies, Metro graph, and Mobile adapters.

### `@cherrystudio/ai-sdk-provider`

Mobile uses the published package for CherryIN and OpenAI-compatible provider behavior, including
reranking, reasoning-model token conversion, and embedding. New versions require consumer and
dependency review before the pinned version changes.

### Dependency resolution

The published `ai-core@2.4.2` and `ai-sdk-provider@0.1.9` require OpenAI SDK `3.0.109`; `ai-core`
also requires Azure SDK `3.0.116`. Mobile pins those versions and carries the matching OpenAI patch.
Both Cherry packages now require Google SDK `3.0.132`. Mobile pins it with its required
`@ai-sdk/provider@3.0.18` and `@ai-sdk/provider-utils@4.0.58`, retaining the Google model-path and
image-routing patch.
Expo-specific dependency choices and Pi patches remain Mobile-owned. A later Desktop version bump
by itself is not a reason to change the Mobile graph.

## Published Provider Registry

`@cherrystudio/provider-registry@0.2.3` supplies pure schemas, reasoning rules, and `createRegistry`
through its root entry. Mobile bundles trusted providers through `./data/providers`; the `./node`
filesystem loader and the complete model catalog stay outside the application bundle. Test-only
fixtures use the package's JSON exports.

`MobileRegistryLoader` owns download readiness, snapshot replacement, and Mobile compatibility
checks, delegating model queries to the package. `mobileProviderCatalog.ts` adds Mobile-only presets,
OAuth metadata, adapter differences, and legacy flags. `providerRegistryProjection.ts` retains the
existing persisted endpoint and feature shapes. Portable URL rules live in the existing
`@cherrystudio/universal/utils/url` owner. Mobile does not retain the upstream source or generator.

The saved Model schema retains the legacy `web-search` capability so existing user data remains
readable. The published package models native search through `serverTools`; the Pi runtime consumes
the bundled declarations and eligibility as described in [Web Search](../web-search.md). Mobile
excludes `ultra` from selectable reasoning efforts and rejects
`adaptive-between-tools` entries until the native runtime supports them.

### Current migration ledger

Implementation does not mean admission. Implemented rows still require the repository tests, type
check, platform exports, and device acceptance before the registry compatibility version advances.

| Registry concern | Mobile state | Runtime scope |
| --- | --- | --- |
| Remote manifest compatibility | Implemented with an independent registry compatibility version | Downloads v3; older cached schemas remain readable offline; baseline `2.1.4` |
| Model and override lookup | Implemented with parameter-size-preserving normalized indexes | Shared model materialization used by Pi and AI SDK paths |
| Reasoning support metadata | Implemented in materialized Model data | Pi consumes supported/default thinking levels |
| Reasoning wire dialects | Implemented for Pi request serialization | Pi translates the shared interpreter's emissions into native endpoint payloads |
| Service tiers | Materialized in Model data only | No request path sends a service tier |
| Endpoint dialect and actual-cost reporting | Partially implemented | Cost trust is shared; stream usage and reasoning summary are AI SDK concerns |
| Server tools and model eligibility | Implemented for the Pi conversation path from the bundled declarations; live-provider validation pending | Downloaded catalogs cannot grant a native tool; endpoints without an adapter keep the application Web Search |
| Compatibility validator and catalog publishing tools | Desktop/shared-package responsibility | Their audit differences do not represent missing Mobile runtime behavior |
| V3 reader migration | Implemented; validation pending | Unknown vocabulary and incompatible entries are dropped individually; unsupported native tools and reasoning dialects remain excluded |
| Mobile-only presets and OAuth | Retained as product extensions | Trusted connection data stays local; all model rows come from the remote snapshot |

### Remote catalog policy

Mobile fetches `models.json` and `provider-models.json` on first use, during a saved-schema upgrade,
and after explicit model-list access. Before it admits a newer Desktop snapshot, the Runtime must
understand every required field it consumes and
explicitly classify unsupported optional fields as ignored product capabilities.

The remote payload is unsigned, so `providers.json` stays bundled and trusted. Remote data may
refine model descriptions, capabilities, and Provider-model overrides. Those overrides may select
an endpoint type already declared by the bundled Provider and may update image-generation
`vendorTransport` relative paths and sync/async behavior. They cannot add or replace Provider
definitions, base URLs, adapter families, headers, or credential behavior. Incompatible manifests
are rejected before download and activation. The Mobile-owned provider extensions affect connection metadata only; remote snapshots replace
all model rows, including the `github` namespace.

The current download lane is v3. Unknown capabilities and efforts are dropped at the smallest list
item; entries with an unsupported protocol are omitted. `serverTools` in a downloaded catalog and
`ultra` have no Mobile consumer. The `adaptive-between-tools` model dialect is also excluded while the
pinned Anthropic SDK lacks `between_tools`. Always-on adaptive reasoning uses the shared interpreter.
Provider connection and authentication behavior stays bundled. Old snapshots remain usable offline
while startup attempts the schema upgrade; schema version takes priority over workflow revision.

## Pi Boundary

Mobile conversation execution remains based on `@earendil-works/pi-agent-core` and
`@earendil-works/pi-ai`. Desktop application code owns different filesystem sessions, workspaces,
Shell tools, skills, approvals, MCP adaptation, and Electron services. Mobile must not copy those
owners into its local Runtime.

A reusable provider fact can cross the boundary only after a Pi adapter consumes it. For example,
endpoint type, base URL, headers, model limits, capability flags, and cost metadata currently feed
`piModelResolver.ts`. AI SDK request-body transforms, provider plugins, and context middleware do
not become Pi behavior merely because both applications call the same provider.

Mobile continues to own its Agent Host, Pi Runtime, provider/model resolver, persistence, device
tools, managed files, and lifecycle.

## Image Generation Boundary

Image generation has a reusable AI SDK surface because Mobile already executes it through
`AiService`. The `@cherrystudio/ai-runtime/image` entry is the explicit consumption boundary for
canonical parameter splitting, the shared wire-profile engine, model routing metadata, and
submit/poll/cancel transport contracts. Provider factories and result normalization remain in the
same package where the current Mobile path consumes them.

Desktop jobs, `AiService`, `FileManager`, Node `Buffer`, and persistence do not cross that boundary.
Mobile retains scheduling, storage, download, presentation, and recovery. Fetch, credentials,
OAuth, timeout, logging, and translation enter through Mobile-owned adapters.

## Synchronization Procedure

Desktop changes are reviewed by hand against this document. Blanket copying into the former
`src/aiCore` layout is not a supported synchronization path.

1. In a clean Desktop checkout, list the unreviewed changes with
   the release diff for the pinned registry package, adding any other path this document admits
   for the behavior under review. Never record a local absolute checkout path.
2. Inventory each candidate behavior's Mobile callers and classify it as Pi conversation behavior,
   non-conversation `AiService` behavior, or shared provider data.
3. Reject behavior outside that consumer closure. In particular, do not route Desktop context,
   host, persistence, lifecycle, or tool-loop code into the Pi path.
4. Update the published package only with the smallest Mobile adapter change and tests that protect
   the consumed behavior.
5. Retain Mobile's snapshot loader, Expo transport, persisted-data compatibility, and
   product-specific providers.
6. Change AI SDK dependencies and patches only when required by the selected behavior, then
   regenerate the lockfile with `pnpm@12.2.1`.
7. Run the owning package tests, `pnpm typecheck`, `pnpm lint`, and `pnpm format:check`, followed by
   the required production platform exports and device acceptance.
8. Advance the registry compatibility version only after all consumed required semantics are
   implemented, unsupported optional semantics are explicitly classified, and every required gate
   passes.
9. After the package update passes its gates, record the admitted package version above.

## Published Package Admission

Changing a Mobile dependency from `workspace:*` to a published package additionally requires:

1. The tarball contains the entry points, declarations, and catalog data Mobile consumes.
2. Its React Native export graph contains no `node:*`, Electron, `@main`, `@application`, or Desktop
   data-service imports.
3. The root barrel does not re-export a Node entry or unused Desktop Runtime surface into Metro.
4. AI SDK and Pi dependencies use compatible peer ranges and resolve to Mobile-controlled patched
   versions.
5. Provider request fixtures and error, cancellation, tool, stream, and image-result contracts
   agree for the Mobile execution path that consumes them.
6. A packed artifact is consumed by a minimal Expo application before the local package is removed.

An Electron build does not demonstrate React Native compatibility.

## Related

- [Backend AI Target Architecture](./target-architecture.md)
- [AI Provider Integration](./provider-integration.md)
- [Provider Serving Boundaries](./provider-serving-boundaries.md)
- [Agent Runtime](../agent/agent-runtime.md)
