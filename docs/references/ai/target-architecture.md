# Backend AI Target Architecture

Status: **local architecture as built; future PC Agent Controller boundary is design-only and not
implemented** (see [Migration Status](#migration-status)).

This reference records the implemented local structure for `src/backend/ai`, the seam rules that
keep the conversation Runtime replaceable, and the design-only PC Agent Controller boundary.
Detailed as-built behavior is documented in [Agent Architecture](../agent/README.md),
[AI Provider Integration](./provider-integration.md), and
[Provider Serving Boundaries](./provider-serving-boundaries.md).

## Decisions And Constraints

- **Whole-Runtime Desktop alignment is retired as an implementation constraint.** Serialized data
  — message part JSON, the SQLite schema, checkpoint payload columns — stays desktop-aligned.
  Application module layout, port inventories, and the former `packages/ai-runtime` trust workflow
  do not. Independently published shared packages such as `ai-core` and `ai-sdk-provider` remain
  exact mirrors; see [Desktop AI Package Reuse](./desktop-package-reuse.md). Complexity that exists
  only to mirror Desktop application structure is removable on sight.
- **Drivers, ranked:** comprehension cost, then Runtime replaceability, then desktop-legacy
  removal. When two moves conflict, the higher driver wins.
- **Pi is the sole conversation trunk.** The AI SDK path serves non-conversation generation only:
  `AiService` (generate text, generate image, model check, model listing) and the tools that call
  back into it.
- **The Runtime seam stays at `agent/runtime/types.ts`.** It is an in-process execution boundary for
  the local Mobile Agent. Its replacement candidate is a different local loop, not a remote Agent
  service.
- **Future PC Agent control sits at the application-protocol boundary.** A mobile-owned adapter
  receives PC Runtime DTOs and events and maps them into the versioned Agent Protocol representation
  consumed by the application. The integration neither requires nor depends on the PC implementing
  the local TypeScript `AgentProtocol` interface or exposing the mobile `AgentRuntime`; the PC
  remains authoritative for its Agents, Sessions, turns, tool execution, approvals, tasks, and
  persistence. The adapter separately owns transport, authentication, ordering, replay,
  reconnection, and wire compatibility. The current `local`-only protocol value remains as-built
  until that application extension is implemented.
- **Frozen boundaries.** Above: the Agent Protocol (`src/shared/contracts/agent/`), its event
  delta semantics, and the frontend projection. Below: the SQLite schema. Everything between the
  two boundaries in application-owned orchestration may be redesigned; independently published
  package contracts remain governed by their own compatibility rules.
- The 13 protocol invariants in [Agent Protocol](../agent/agent-protocol.md#invariants) survive
  every phase. Terminal persistence before publication and side-effect ordering in finalization
  remain explicit calls; an event bus would make those ordering guarantees implicit and is
  rejected.

## Local Structure

```text
src/backend/ai/
├── agent/
│   ├── host/            Orchestration core: admission, atomic reservation, event loop,
│   │                    terminal persistence, restart reconciliation. Protocol invariants only.
│   │                    Turn preparation (turnPreparation.ts) and attachment materialization
│   │                    (turnAttachments.ts) stay write-free and testable without a Host.
│   │                    The two adaptation directions are separate: turnRuntimeInput.ts
│   │                    assembles the Runtime request, runtimeProjection.ts projects Runtime
│   │                    output onto the protocol. Side effects (naming, usage, background
│   │                    reply) keep explicit call sites; per-event notification is driven
│   │                    from the run loop, not repeated in each branch. The Host
│   │                    takes its collaborators as `MobileAgentHostPorts`;
│   │                    AgentHostDependencies.ts is the one place that binds them
│   │                    to application services, so the Host constructs nothing.
│   ├── runtime/
│   │   ├── types.ts     The seam contract. No imports from packages/* ports. Neutral usage
│   │   │                shape. Model preflight lives here; the language-serving question
│   │   │                needs app entities, so it is a separate interface the Runtime
│   │   │                implementation answers (see Seam Rule 4).
│   │   ├── FakeRuntime.ts  Conformance double; updated with every contract change.
│   │   └── pi/          Everything Pi-specific: PiRuntime, model resolution, API adapters,
│   │                    stream binding, the Pi language binding decision, context
│   │                    compaction, Pi message mapping.
│   ├── sessionStore/    Unchanged.
│   ├── tools/           Unchanged structure; service access via injected narrow interfaces
│   │                    instead of application.get.
│   └── resources/       Unchanged.
├── provider/            Runtime-agnostic connection facts: resolved endpoints, transport
│                        policies, model listing support. No Pi-named exports.
├── AiService.ts         Single non-conversation facade; generation/ becomes its private
│                        implementation.
└── mcp/                 Unchanged.
```

The tree records current owners. Future modules and directories follow
[Naming Conventions](../naming-conventions.md) without changing those ownership boundaries.

## Seam Rules

1. **Pi isolation.** In the current implementation, outside `agent/runtime/pi/`, no file imports Pi symbols or
   `@earendil-works/*`. Enforced by lint, not convention. Within the zone, only
   `piModelResolver.ts` may reach the Data API and Expo — it is the bridge from Provider and Model
   records to a Pi model, and lint scopes that exemption to the same file the conformance harness
   leaves out of its purity list. A future shared Pi package requires an explicit architecture and
   lint-rule change; the package design alone is not an exception.
2. **Contract purity.** `agent/runtime/types.ts` depends on no `packages/*` port. The usage report
   uses a neutral shape defined in the contract; the Pi resolver maps into it.
3. **One binding point.** The composition root creates and registers the Runtime. Replacing the
   Runtime means adding one implementation directory and changing one composition line. The Host
   never constructs a Runtime.
4. **Capability questions go through the bound Runtime.** "Can this model serve?" is answered by
   the Runtime, never by importing a specific runtime's binding logic. Per-turn questions use the
   contract's `preflightModel`. The settings-level question needs the full `Provider` and `Model`
   records — which the contract may not import (Rule 2) and which a `RuntimeModel` id cannot
   recover, since remote provider model lists are not persisted. It is therefore declared as
   `LanguageServingSupport` in the provider layer and implemented by the Runtime service, so
   re-pointing the `AgentRuntime` registration swaps both answers together. Image-generation
   support stays an AI SDK concern and is not routed through the seam.
5. **Normalized history is the seam currency.** The Host side maps protocol transcripts into the
   normalized Runtime shape; each Runtime maps that shape into its own messages. Neither side
   imports the other's mapping.

## Planned PC Agent Controller Boundary

PC Agent control does not extend the local Runtime seam across a network transport:

```text
Agent Client
    ↕ Agent Protocol values
Mobile PC Agent Adapter
    ↕ transport-specific connection and PC wire DTOs/events
PC Agent Runtime / Host
    ├─ authoritative Agent and Session data
    ├─ conversation execution and tool loop
    └─ approvals, background tasks, and persistence
```

The mobile adapter owns transport requests, authentication handoff, PC error normalization,
event/snapshot translation, ordering, replay, and conversion into the application protocol. It does
not execute PC tools, persist a second authoritative Session, translate PC objects into
`RuntimeTool` callbacks, or make the PC conform to Pi or mobile Runtime internals.

The Agent Client will continue to consume one application-facing protocol shape. Local Sessions are
served by the Mobile Agent Host; future PC Sessions will be served through the PC adapter. Mobile
renders a temporary projection and sends user intent back to the PC; conversation and execution
state stay authoritative on the PC. Any local storage for PC data is a cache or projection whose
invalidation and replay rules must be specified with the adapter contract. The application
extension must be versioned rather than representing a PC Session as the current `{ kind: 'local' }`
execution target. A global source registry is intentionally deferred until a concrete multi-PC
product flow requires one.

## Success Criteria

1. Pi isolation holds repo-wide and is lint-enforced.
2. `agent/runtime/types.ts` has no `packages/*` dependency.
3. Swapping the Runtime touches one new directory plus one composition line.
4. The orchestration core contains protocol orchestration and invariants only; turn preparation
   and attachment materialization are testable without a Host instance.
5. The former whole-`ai-runtime` desktop-sync trust workflow is retired, while independently
   published package mirrors remain enforced. `packages/ai-runtime` states an identity that matches
   what it is and exports nothing without a consumer. (This criterion originally read "the package
   is deleted"; see [Package Disposition](#package-disposition).)
6. Existing Host and Runtime conformance suites stay green through every phase; the invariant list
   in [Agent Protocol](../agent/agent-protocol.md#invariants) is the permanent baseline.

## Migration Status

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | This document; retire the `ai-runtime` desktop-sync trust workflow | Landed |
| 1 | Seal the seam: Runtime binding at the composition root, split the Pi language binding out of `provider/`, neutral usage shape in the contract, language capability query behind `LanguageServingSupport`, Pi-isolation lint rule | Landed |
| 2 | Host decomposition | Landed (#696: `turnPreparation.ts`, `turnAttachments.ts`, Pi lifecycle phases; then the mapping split into `turnRuntimeInput.ts`/`runtimeProjection.ts` and the run-loop background-reply notification) |
| 3 | Make the AI SDK path private to `AiService`, inject app services into the built-in tool catalog, reposition `packages/ai-runtime` and remove its unconsumed exports | Landed |
| 4 | Fold `agent/piAdapter/` into `agent/runtime/pi/` so the Pi zone is one directory | Landed |

## Package Disposition

`packages/ai-runtime` is **not** deleted. The plan assumed the app consumed a small slice of a
mostly-dead desktop port, so inlining the consumed symbols would shrink the tree. Measurement on
2026-08-28 showed the opposite: 55 consumed symbols pull a transitive closure of 79 files / 10,898
lines — **84% of the package's 12,941 non-test lines**, dominated by per-vendor provider adaptation.

Moving that into `src/backend/ai/provider/` would relocate ~11k lines without removing any
complexity, and per-vendor adapters are well served by a package boundary. So the disposition
changed to: keep the package, give it an identity that matches what it does (vendor adaptation for
the AI SDK path, not a migration staging area), and delete what nothing consumes — 22 modules and
their tests, plus the now-empty `messages` subpath.

One deliberate exception: `custom/wire/` has no static consumer but carries the boundary tests that
pin our request shaping against upstream AI SDK packages for the image vendors. Deleting a tested
guard to improve a dead-code number is the wrong trade; it stays, and the README says why.

The migration order was Phase 1 before Phases 2 and 3 so the contract settled before code moved;
Phases 2 and 3 were independent of each other.

## Related

- [Agent Architecture](../agent/README.md) — as-built execution boundary
- [Agent Runtime](../agent/agent-runtime.md) — as-built seam contract and conformance
- [Provider Serving Boundaries](./provider-serving-boundaries.md) — provider control plane and
  serving planes; Phase 1 here continues its staged ownership migration
- [Desktop AI Package Reuse](./desktop-package-reuse.md) — package-level reuse and publication
  admission rules
- [Code Organization](../code-organization.md) — placement rules for the moves above
