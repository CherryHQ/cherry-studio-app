# Desktop AI Reuse

Status: **Mobile now declares published `@cherrystudio/ai-core@2.1.0` and
`@cherrystudio/ai-sdk-provider@0.1.7` in place of local source packages; Expo and device acceptance
of those artifacts is pending. Mobile does not mirror Desktop's conversation Runtime. Provider
registry admission remains incomplete, and Mobile's remote registry compatibility stays pinned to
Desktop `2.0.8` pending an explicit compatibility review.**

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
| `@cherrystudio/provider-registry` | Port platform-neutral catalog semantics while retaining Mobile's static JSON loader and persisted-data compatibility projection |
| Desktop custom providers and image transports | Port reusable wire behavior into Mobile's private `@cherrystudio/ai-runtime` when an existing Mobile feature consumes it |
| Desktop Pi Runtime | Do not consume it directly; Mobile owns its Pi host, adapters, persistence, tools, and lifecycle |
| `@cherrystudio/dsh-bridge` | Desktop-only |

Desktop UI and table packages are outside this AI Runtime decision and require separate React
Native and ownership assessments.

## Published AI SDK Reuse

### `@cherrystudio/ai-core`

Mobile imports the published `ai-core` package through the private implementation behind
`AiService`. Production consumers use provider construction, non-conversation text generation,
model probes, and image generation. `packages/ai-runtime` owns Mobile's provider configuration and
web-search option types that the published package does not expose.

The published package also contains Desktop context and Agent helpers. They have no Mobile
conversation consumer: that execution and context are owned by
`src/backend/ai/agent/runtime/pi/`. New versions must still be reviewed against the consumed
exports, patched AI SDK dependencies, Metro graph, and Mobile adapters.

### `@cherrystudio/ai-sdk-provider`

Mobile uses the published package for CherryIN and OpenAI-compatible provider behavior, including
reranking, reasoning-model token conversion, and embedding. New versions require consumer and
dependency review before the pinned version changes.

### Dependency resolution

The published `ai-core@2.1.0` and `ai-sdk-provider@0.1.7` require OpenAI SDK `3.0.109`; `ai-core`
also requires Azure SDK `3.0.116`. Mobile pins those versions and carries the matching OpenAI patch.
Expo-specific dependency choices and Pi patches remain Mobile-owned. A later Desktop version bump
by itself is not a reason to change the Mobile graph.

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
| Reasoning wire dialects | Implemented for AI SDK and Pi request serialization | Pi translates the shared interpreter's emissions into native endpoint payloads |
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
refine model descriptions, capabilities, and Provider-model overrides. Those overrides may select
an endpoint type already declared by the bundled Provider and may update image-generation
`vendorTransport` relative paths and sync/async behavior. They cannot add or replace Provider
definitions, base URLs, adapter families, headers, or credential behavior. Incompatible manifests
are rejected before download and activation. The Mobile-owned `github` namespace is also
authoritative: bundled GitHub overrides replace, rather than mix with, any `github` rows in a
Desktop snapshot.

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

Use the project [sync-cherry-desktop skill](../../../.agents/skills/sync-cherry-desktop/SKILL.md)
and `pnpm desktop:sync:audit` for scoped review. The legacy Port Bot workflow is retired; blanket
copying into the former `src/aiCore` layout is not a supported synchronization path.

1. Record the Desktop commit being assessed; never record a local absolute checkout path.
2. Inventory the candidate behavior's Mobile callers and classify it as Pi conversation behavior,
   non-conversation `AiService` behavior, or shared provider data.
3. Reject behavior outside that consumer closure. In particular, do not route Desktop context,
   host, persistence, lifecycle, or tool-loop code into the Pi path.
4. Update the published package only with the smallest Mobile adapter change and tests that protect
   the consumed behavior.
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
