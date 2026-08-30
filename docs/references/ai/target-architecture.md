# Backend AI Target Architecture

Status: **local target state landed 2026-08-28; future remote boundary approved but not
implemented** (see [Migration Status](#migration-status)).

This reference records the approved target structure for `src/backend/ai`, the seam rules that keep
the conversation Runtime replaceable, and the success criteria each migration pull request is
reviewed against. As-built behavior stays documented in [Agent Architecture](../agent/README.md),
[AI Provider Integration](./provider-integration.md), and
[Provider Serving Boundaries](./provider-serving-boundaries.md); this document governs where the
implementation is heading and why.

## Decisions And Constraints

- **Desktop alignment is retired as an implementation constraint.** Serialized data — message part
  JSON, the SQLite schema, checkpoint payload columns — stays desktop-aligned. Module layout, port
  inventories, and the `packages/ai-runtime` desktop-sync trust workflow do not. Complexity that
  exists only to mirror desktop structure is removable on sight.
- **Drivers, ranked:** comprehension cost, then Runtime replaceability, then desktop-legacy
  removal. When two moves conflict, the higher driver wins.
- **Pi is the sole conversation trunk.** The AI SDK path serves non-conversation generation only:
  `AiService` (generate text, generate image, model check, model listing) and the tools that call
  back into it.
- **The Runtime seam stays at `agent/runtime/types.ts`.** It is an in-process execution boundary for
  the local Mobile Agent. Its replacement candidate is a different local loop, not a remote Agent
  service.
- **Future remote Agent integration sits at the application-protocol boundary.** A mobile-owned
  HTTP adapter calls the remote service, receives its wire DTOs and events, and maps them into the
  versioned Agent Protocol representation consumed by the application. The integration neither
  requires nor depends on the remote service implementing the local TypeScript `AgentProtocol`
  interface or exposing `AgentRuntime`; the service remains authoritative for its Agents, Sessions,
  turns, tool execution, approvals, and persistence. The current `local`-only protocol value remains
  as-built until that product defines its routing, versioning, reconnection, and cache behavior.
- **Frozen boundaries.** Above: the Agent Protocol (`src/shared/contracts/agent.ts`), its event
  delta semantics, and the frontend projection. Below: the SQLite schema. Everything between the
  two boundaries may be redesigned.
- The 13 protocol invariants in [Agent Protocol](../agent/agent-protocol.md#invariants) survive
  every phase. Terminal persistence before publication and side-effect ordering in finalization
  remain explicit calls; an event bus would make those ordering guarantees implicit and is
  rejected.

## Target Structure

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
│   │                    from the run loop, not repeated in each branch.
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

New module and directory names are chosen at implementation time following
[Naming Conventions](../naming-conventions.md); the roles above are the commitment, not the names.

## Seam Rules

1. **Pi isolation.** Outside `agent/runtime/pi/`, no file imports Pi symbols or
   `@earendil-works/*`. Enforced by lint, not convention. Within the zone, only
   `piModelResolver.ts` may reach the Data API and Expo — it is the bridge from Provider and Model
   records to a Pi model, and lint scopes that exemption to the same file the conformance harness
   leaves out of its purity list.
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

## Future Remote Agent Integration Boundary

Remote Agent integration does not extend the local Runtime seam across HTTP:

```text
Agent Client
    ↕ Agent Protocol values
Mobile Remote Agent Adapter
    ↕ remote HTTP API and remote wire DTOs/events
Remote Agent Service
    ├─ authoritative Agent and Session data
    ├─ execution and tool loop
    └─ approvals and persistence
```

The mobile adapter owns HTTP request construction, authentication handoff, remote error
normalization, event/snapshot translation, and conversion into the application protocol. It does
not execute remote tools, persist a second authoritative Session, translate remote objects into
`RuntimeTool` callbacks, or make the remote service conform to Pi or mobile Runtime internals.

The Agent Client will continue to consume one application-facing protocol shape. Local Sessions are
served by the Mobile Agent Host; future remote Sessions will be served through the HTTP adapter. Any
local storage for remote data is a cache or projection whose invalidation and replay rules must be
specified with the remote wire contract. The exact protocol extension for selecting and routing a
remote source is intentionally deferred; it must be versioned rather than representing a remote
Session as the current `{ kind: 'local' }` execution target.

## Success Criteria

1. Pi isolation holds repo-wide and is lint-enforced.
2. `agent/runtime/types.ts` has no `packages/*` dependency.
3. Swapping the Runtime touches one new directory plus one composition line.
4. The orchestration core contains protocol orchestration and invariants only; turn preparation
   and attachment materialization are testable without a Host instance.
5. The desktop-sync trust workflow is retired, `packages/ai-runtime` states an identity that
   matches what it is, and it exports nothing without a consumer. (This criterion originally read
   "the package is deleted"; see [Package Disposition](#package-disposition).)
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

Phase 1 precedes 2 and 3; the contract shape must settle before code moves against it. Phases 2
and 3 are independent of each other.

## Related

- [Agent Architecture](../agent/README.md) — as-built execution boundary
- [Agent Runtime](../agent/agent-runtime.md) — as-built seam contract and conformance
- [Provider Serving Boundaries](./provider-serving-boundaries.md) — provider control plane and
  serving planes; Phase 1 here continues its staged ownership migration
- [Code Organization](../code-organization.md) — placement rules for the moves above
