# AI And Services

Read [Desktop AI Reuse](../../../../docs/references/ai/desktop-package-reuse.md) completely before
selecting AI changes. It owns admission rules and the current registry compatibility ledger.

## Select Behavior By Consumer

For each candidate, identify a current production caller and classify its execution path:

- Pi conversation behavior belongs behind Mobile's Agent Runtime contract.
- Non-conversation text, model checks/listing, and image generation use `AiService` and the AI SDK.
- Shared provider connection facts may serve both paths through their existing resolvers.

`packages/ai-core` and `packages/ai-sdk-provider` are semantic ports. Compare behavior, imports,
tests, dependencies, and exports within the admitted consumer closure; do not copy whole desktop
trees or require identical packaging. Do not restore desktop conversation-loop or context modules
because their names include `Agent` or they reside in an AI package.

Mobile owns its Pi host, persistence, lifecycle, tools, approval flow, and platform services.
Desktop filesystem sessions, Shell tools, Electron services, and application owners do not cross
that boundary. Wire behavior needs an adapter in the path that actually consumes it.

## Review Provider Registry Admission Separately

Port catalog semantics while retaining the static JSON Mobile loader, persisted-data projection,
and Mobile-only providers. Keep Node-only loaders outside Metro's dependency graph.

Trace consumed fields through model materialization, provider resolution, request serialization,
settings, icons, and tests. Do not assume an AI SDK serializer change also changes Pi requests.
Unsupported optional capabilities need an explicit product classification, not automatic feature
implementation. Required consumed semantics and all admission gates must pass before the registry
compatibility version advances; follow the current ledger instead of a copied version here.

Remote catalogs cannot replace trusted bundled provider definitions, base URLs, headers, adapter
families, or credentials. A synchronization baseline does not relax that policy.

## Port Services And Shared Helpers

For services reached by the selected feature, preserve inputs, outputs, error mapping, redaction,
cancellation, timeouts, retries, lifecycle, and security checks. Keep platform differences behind
existing Expo/React Native adapters. Do not import desktop composition roots or invent unused
service APIs to satisfy tree parity.

Admit `universal` helpers according to
[Universal Package](../../../../docs/references/universal-package.md). Preserve manifest trims;
check package imports and serialized boundaries before rejecting or removing consumerless code.
Mobile-owned data contracts belong in `src/shared`, not in a restored desktop data mirror.

## Dependencies And Validation

Change SDK versions and patches only when selected behavior requires them. Review peer resolutions,
Metro exports, package boundaries, and Expo compatibility together. Do not copy the desktop lockfile
or add Node-only dependencies to Mobile.

Cover the owning path's request/response, errors, cancellation, stream ordering, tools, and image
transport contracts as applicable. Package checks and platform admission follow
[validation-and-reporting.md](validation-and-reporting.md); hash equality alone is not validation.
