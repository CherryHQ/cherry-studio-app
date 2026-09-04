# Desktop AI Reuse

Status: **selected provider and non-conversation AI SDK changes from Cherry Desktop commit
`246e46b6b04796696a9a4903f4604f5fe9d1ae4b` are ported. Mobile does not mirror Desktop's
conversation Runtime. Provider registry admission remains incomplete, and Mobile's remote registry
compatibility stays pinned to Desktop `2.0.8` pending an explicit compatibility review.**

This reference defines what Mobile may reuse from Cherry Desktop. A Desktop implementation is a
source of behavior to assess, not a tree to copy. Every port needs a concrete Mobile consumer and
must fit one of Mobile's existing execution boundaries.

## Decision

Mobile has two AI execution paths:

- Conversation turns run on `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai` under
  `src/backend/ai/agent/runtime/pi`.
- Non-conversation text generation, model checks, model listing, and image generation run through
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
| `@cherrystudio/ai-core` | Selectively port AI SDK provider, plugin, text, and image behavior consumed by `AiService`; do not copy Desktop context or conversation-loop modules without a Mobile consumer |
| `@cherrystudio/ai-sdk-provider` | Selectively port CherryIN, embedding, reranking, and image transport behavior used by Mobile's AI SDK path |
| `@cherrystudio/provider-registry` | Port platform-neutral catalog semantics while retaining Mobile's static JSON loader and persisted-data compatibility projection |
| Desktop custom providers and image transports | Port reusable wire behavior into Mobile's private `@cherrystudio/ai-runtime` when an existing Mobile feature consumes it |
| Desktop Pi Runtime | Do not consume it directly; Mobile owns its Pi host, adapters, persistence, tools, and lifecycle |
| `@cherrystudio/dsh-bridge` | Desktop-only |

Desktop UI and table packages are outside this AI Runtime decision and require separate React
Native and ownership assessments.

## Selected AI SDK Reuse

### `@cherrystudio/ai-core`

Mobile imports `ai-core` through the private implementation behind `AiService`. Its production
consumers use provider construction, non-conversation text generation, model probes, and image
generation. This branch keeps relevant provider lazy loading, request-scoped provider cache
identity, AI SDK compatibility, and image-result behavior.

Desktop context compaction, model-message adaptation, offloading, and independent fallback-model
resolution have no Mobile consumer. Mobile conversation context is owned by
`src/backend/ai/agent/runtime/pi/contextCompaction.ts`; those Desktop `ai-core` modules are therefore
not ported.

The package is not an exact Desktop mirror. Upstream changes must be reviewed against Mobile's
imports and execution paths before they are applied.

### `@cherrystudio/ai-sdk-provider`

Mobile uses this package for CherryIN and OpenAI-compatible provider behavior. The selected update
adds reasoning-model token conversion and the current embedding endpoint contract used by that
provider path. Unrelated Desktop package changes are not admitted automatically.

### Dependency resolution

When a selected provider change requires a newer AI SDK contract, Mobile aligns the affected SDK
versions and carries the matching patches. Expo-specific dependency choices and Pi patches remain
Mobile-owned. A Desktop version bump by itself is not a reason to change the Mobile graph.

## Provider Registry Is A Semantic Port

`@cherrystudio/provider-registry` is independent in Desktop, but its Node package shape cannot
replace the Mobile package:

- Desktop's Node loader reads catalog files through `node:fs`.
- Mobile statically imports JSON so Metro can include the catalog.
- Mobile retains a compatibility projection for persisted Provider and Model rows.
- Mobile product-specific providers and remote-catalog behavior require explicit reconciliation.

Schemas, generated catalogs, endpoint matrices, reasoning rules, and pure lookup utilities may be
ported by behavior. Mobile retains the `./mobile` loader and must keep Node code outside the React
Native export graph.

### Current migration ledger

Implementation does not mean admission. Implemented rows still require the repository tests, type
check, platform exports, and device acceptance before the registry compatibility version advances.

| Registry concern | Mobile state | Runtime scope |
| --- | --- | --- |
| Remote manifest compatibility | Implemented with an independent registry compatibility version | Shared catalog loading; accepted line remains `2.0.8` |
| Model and override lookup | Implemented with parameter-size-preserving normalized indexes | Shared model materialization used by Pi and AI SDK paths |
| Reasoning support metadata | Implemented in materialized Model data | Pi consumes supported/default thinking levels |
| Reasoning wire dialects | Implemented for the AI SDK request serializer | Does not change Pi's request serializer |
| Service tiers | Implemented for the AI SDK request path | Does not add service-tier delivery to Pi conversation requests |
| Endpoint dialect and actual-cost reporting | Partially implemented | Cost trust is shared; stream usage and reasoning summary are AI SDK concerns |
| Server tools and model eligibility | Intentionally unsupported by the current Mobile product path | Must be ignored explicitly; Mobile's application Web Search remains independent |
| Compatibility validator and catalog publishing tools | Desktop/shared-package responsibility | Their audit differences do not represent missing Mobile runtime behavior |
| Full catalog compatibility review | Outstanding | Blocks compatibility-version and synchronization-manifest advancement |
| Mobile-only `github` preset | Retained as a product extension | Its bundled provider-model namespace replaces any remote `github` rows |

### Remote catalog policy

Mobile may fetch `models.json` and `provider-models.json` after explicit user action. Before it
admits a newer Desktop snapshot, the Runtime must understand every required field it consumes and
explicitly classify unsupported optional fields as ignored product capabilities.

The remote payload is unsigned, so `providers.json` stays bundled and trusted. Remote data may
refine model descriptions, capabilities, and overrides, but it cannot redirect API traffic, change
credential behavior, or introduce a Provider endpoint. Incompatible manifests are rejected before
download and activation. The Mobile-owned `github` namespace is also authoritative: bundled GitHub
overrides replace, rather than mix with, any `github` rows in a Desktop snapshot.

Desktop `2.0.9` remains rejected while its complete model and override payload has not passed a
Mobile compatibility review. Provider-native `serverTools` are not by themselves an admission
requirement: Mobile may explicitly ignore those optional declarations while its application-owned
Web Search remains the only conversation search path. Admission must still prove that removing the
older per-model `web-search` capability does not alter any Mobile UI, model filtering, or request
behavior that actually consumes it.

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

1. Record the Desktop commit being assessed; never record a local absolute checkout path.
2. Inventory the candidate behavior's Mobile callers and classify it as Pi conversation behavior,
   non-conversation `AiService` behavior, or shared provider data.
3. Reject files and exports outside that consumer closure. In particular, do not copy Desktop
   context, host, persistence, lifecycle, or tool-loop code into the Pi path.
4. Port the smallest production change into the owning Mobile boundary and bring over only tests
   that protect the selected behavior.
5. Retain Mobile's static registry loader, Expo transport, persisted-data compatibility, and
   product-specific providers.
6. Change AI SDK dependencies and patches only when required by the selected behavior, then
   regenerate the lockfile with `pnpm@12.2.1`.
7. Run the owning package tests, `pnpm typecheck`, `pnpm lint`, and `pnpm format:check`, followed by
   the required production platform exports and device acceptance.
8. Advance a registry compatibility manifest only after all consumed required semantics are
   implemented, unsupported optional semantics are explicitly classified, and every required gate
   passes.

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
