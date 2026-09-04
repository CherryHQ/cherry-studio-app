# Desktop AI Package Reuse

Status: **the Mobile `ai-core` and `ai-sdk-provider` source trees mirror Cherry Desktop commit
`246e46b6b04796696a9a4903f4604f5fe9d1ae4b`. Their recorded Manifest baseline must not advance
until the required gates pass. The current registry drift and new Runtime packages remain
unimplemented**.

This reference defines which Cherry Desktop AI packages Mobile can consume, which code must be
ported rather than copied, and where a future shared package boundary belongs. Feature parity
alone is not evidence that code is portable.

## Decision

Mobile accepts source changes needed to consume genuinely cross-platform packages. Shared code is
preferred when it owns provider protocol, request shaping, or platform-neutral execution
semantics. Electron application orchestration is not moved into Mobile merely to reduce visible
source differences.

| Desktop surface | Package state | Mobile status | Synchronization rule |
| --- | --- | --- | --- |
| `@cherrystudio/ai-core` | Published; React Native export declared | Source mirror copied; baseline validation pending | Exact tracked-file mirror |
| `@cherrystudio/ai-sdk-provider` | Published | Source mirror copied; baseline validation pending | Exact tracked-file mirror |
| `@cherrystudio/provider-registry` | Independent but private | Existing older semantic port; Desktop drift after its recorded baseline is not yet ported | Semantic port; never overwrite the Mobile adapter |
| Desktop custom providers and image transports | Still under `src/main/ai` | Mobile implementation remains in private `@cherrystudio/ai-runtime` | Future extraction below the application-service boundary |
| Desktop Pi Runtime | Application source, not a portable package | Direct consumption rejected | Future platform-neutral Pi core only |
| `@cherrystudio/dsh-bridge` | Private and desktop-specific | Not a Mobile dependency | Desktop-only |

Desktop UI and table packages are outside this AI Runtime decision and require separate React
Native and ownership assessments.

## Synchronized Packages

### `@cherrystudio/ai-core`

The complete Desktop `packages/aiCore` tracked tree is mirrored at `packages/ai-core`, including
source, tests, metadata, changelog, and build configuration. Platform adaptations belong in the
Mobile caller, not inside this package. The removed legacy `webSearchPlugin` type surface is now
represented by Mobile's provider-tool configuration instead of a Mobile-only file in the exact
mirror.

The synchronized version adds the context compaction primitives, provider lazy loading, model
retry/fallback support, server-tool plumbing, and image URL response handling present at the
recorded Desktop commit.

Known upstream documentation drift: the mirrored package README still advertises the deleted
`webSearchPlugin` export. Current callers use `providerToolPlugin('webSearch', config)`. Fix that
README in Desktop rather than reintroducing a Mobile-only file into the mirror.

### `@cherrystudio/ai-sdk-provider`

The complete tracked tree is mirrored at the same package path. It includes the CherryIN
reasoning-model token transformation and current embedding endpoint behavior.

### Dependency resolution

An exact source mirror is incomplete when Mobile resolves incompatible AI SDK versions. The
workspace therefore aligns the versions required by both packages and carries matching Desktop
patches for Google, OpenAI, OpenAI-compatible, and `ai`. Former DeepSeek and XAI patches are
removed because their behavior is present in the newly resolved upstream versions. Expo-specific
dependency decisions and Pi patches remain Mobile-owned.

## Provider Registry Is Not A Direct Copy

`@cherrystudio/provider-registry` is independent in Desktop, but its current package shape is not
a Mobile replacement:

- Desktop marks it private.
- Its Node loader reads catalog files through `node:fs`.
- Mobile requires statically imported JSON so Metro can include the catalog.
- Mobile retains a compatibility projection for persisted endpoint configuration.
- Mobile product-specific provider and remote-catalog behavior must be reconciled explicitly.

Registry schemas, creators, generated catalogs, endpoint matrices, reasoning rules, and pure
lookup utilities must be synchronized semantically. Mobile retains only the narrow `./mobile`
loader and documented compatibility behavior. A future published package must expose separate
`./mobile` and `./node` entries, and its root entry must not re-export Node code.

| Desktop path | Mobile treatment |
| --- | --- |
| `src/schemas`, `src/creators`, `src/patterns`, `src/utils` | Port behavior to the same package paths |
| `data/*.json` | Regenerate from reconciled sources; retain approved Mobile provider extensions |
| `src/index.ts`, `src/registry-utils.ts` | Merge shared exports while retaining `buildRuntimeEndpointConfigs` until persisted rows migrate |
| `src/registry-loader.ts` | Keep as the `./node` entry; never expose it to Metro |
| Mobile `src/mobile-loader.ts` | Retain as the `./mobile` static-JSON and remote-snapshot entry |

## Pi Boundary

Mobile conversation execution remains based on `@earendil-works/pi-agent-core` and
`@earendil-works/pi-ai`. Desktop's Pi implementation is built around
`@earendil-works/pi-coding-agent` and owns filesystem sessions, workspaces, Shell tools, skills,
approvals, MCP adaptation, and Desktop services. It is an Electron Agent host, not a portable Pi
library.

Mobile must not consume Desktop `PiRuntimeConnection`, `PiRuntimeDriver`, approval extension, code
mode, filesystem resource loader, or Shell integration. A future
`@cherrystudio/pi-runtime-core` may own only:

- endpoint-to-Pi API compatibility;
- platform-neutral model configuration;
- stream binding through narrow `pi-ai` subpath imports;
- error and usage normalization;
- neutral cancellation and message transformation helpers; and
- injected credential and fetch callbacks.

Pi packages must be peer dependencies so Desktop and Mobile cannot silently load incompatible Pi
type universes. Node functionality belongs in a separate package or explicit `./node` entry that
is unreachable from the React Native export graph. Mobile continues to own its Agent Host,
Runtime service, provider/model resolver, persistence, device tools, managed files, and lifecycle.

The current repository-wide Pi isolation rule permits Pi imports only under
`src/backend/ai/agent/runtime/pi`. Creating a Mobile workspace `pi-runtime-core` package therefore
requires an explicit architecture and lint-rule change that grants that package alone a narrow
exception. This design does not authorize adding such imports elsewhere today.

## Image Generation Boundary

Image generation has a larger reusable surface than Pi. A future
`@cherrystudio/ai-provider-runtime` can be extracted from Desktop custom providers and Mobile's
existing `@cherrystudio/ai-runtime`. It should own:

- provider factories and pure endpoint configuration;
- canonical image parameter splitting;
- wire profiles and request-body construction;
- custom AI SDK image models;
- submit, poll, cancel, and result normalization protocols; and
- provider error and usage normalization.

It must not own Desktop `AiService`, `FileManager`, Node `Buffer`, Desktop jobs, or Mobile painting
jobs. The applications share how a provider is called, but retain how a generation task is
scheduled, persisted, downloaded, presented, and recovered. Fetch, credentials, OAuth, timeout,
download, logging, and translation are supplied through narrow host ports.

Until Desktop publishes this layer, Mobile's private `@cherrystudio/ai-runtime` remains the owner
of cross-platform AI SDK vendor adaptation and image wire behavior. It is not the conversation
Runtime.

## Synchronization Procedure

1. Resolve a clean checkout of `https://github.com/CherryHQ/cherry-studio.git` through
   `--desktop-root`; never record a local absolute path.
2. Run `pnpm desktop:sync:audit --desktop-root <path>` for `ai-core`, `ai-sdk-provider`, and
   `provider-registry`, and record the Desktop commit and source hashes.
3. For the exact mirrors, copy the complete Git-tracked tree from Desktop `packages/aiCore` to
   Mobile `packages/ai-core`, and the same-path `packages/ai-sdk-provider` tree. Do not retain
   Mobile-only files inside either mirror.
4. Put caller adaptations outside the exact packages. The current Web Search configuration adapter
   lives in [`packages/ai-runtime/src/utils/websearch.ts`](../../../packages/ai-runtime/src/utils/websearch.ts).
5. Do not edit either mirrored package manifest after copying it. Align only the Mobile root and
   consumer dependency ranges, `pnpm-workspace.yaml` overrides and patched-dependency keys, then
   regenerate `pnpm-lock.yaml` with `pnpm@12.2.1`.
6. Port `provider-registry` separately using the mapping above. Do not advance any Manifest domain
   while its drift is unclassified or a required gate is skipped.
7. Run `pnpm test:ai-core`, `pnpm test:ai-sdk-provider`, `pnpm typecheck`, `pnpm lint`, and
   `pnpm format:check`. Then run the production iOS and Android Expo exports and device acceptance
   required by [Testing And CI](../../guides/testing-and-ci.md).
8. Re-run the audit with `--check`. Record the approved Desktop commit and per-domain source hashes
   in [`desktop-sync-manifest.json`](../../../desktop-sync-manifest.json) only after every required
   gate passes.

## Published Package Admission

Changing a Mobile dependency from `workspace:*` to a registry version requires all of the
following:

1. The tarball contains the documented entry points, declarations, and catalog data.
2. Its React Native export graph contains no `node:*`, Electron, `@main`, `@application`, or
   Desktop data-service imports.
3. The root barrel does not re-export a Node entry.
4. AI SDK and Pi dependencies use compatible peer ranges and resolve to Mobile-controlled patched
   versions.
5. Catalog data uses a static Mobile loader rather than runtime filesystem access.
6. Provider request fixtures and error, cancellation, tool, stream, and image-result contracts
   agree across Desktop and Mobile.
7. A packed artifact is consumed by a minimal Expo application before the local mirror is
   removed. Production iOS and Android export checks remain required before release adoption.

A package that only passes an Electron build is not React Native compatible.

## Related

- [Backend AI Target Architecture](./target-architecture.md)
- [AI Provider Integration](./provider-integration.md)
- [Provider Serving Boundaries](./provider-serving-boundaries.md)
- [Agent Runtime](../agent/agent-runtime.md)
