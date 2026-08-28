# Backend AI Target Architecture

Status: **target state approved 2026-08-28; migration in progress** (see
[Migration Status](#migration-status)).

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
- **The Runtime seam stays at `agent/runtime/types.ts`.** Replacement candidates are a future
  remote agent service and, as insurance, a different in-process loop. Nothing is designed for the
  remote case now: no execution-target variants, no reattach or resume structure, no topology
  assumptions. The `local`-only note in `src/shared/contracts/agent.ts` stands until that product
  exists.
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
│   │                    Side effects (naming, usage, background reply) converge behind one
│   │                    explicitly ordered turn-observer seam.
│   ├── runtime/
│   │   ├── types.ts     The seam contract. No imports from packages/* ports. Neutral usage
│   │   │                shape. Model preflight and static capability queries live here.
│   │   ├── FakeRuntime.ts  Conformance double; updated with every contract change.
│   │   └── pi/          Everything Pi-specific: PiRuntime, the current piAdapter/ content
│   │                    (model resolution, API adapters, stream binding), the Pi language
│   │                    binding decision, context compaction, Pi message mapping.
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

1. **Pi isolation.** Outside `agent/runtime/pi/` (including the current `agent/piAdapter/` until it
   moves), no file imports Pi symbols or `@earendil-works/*`. Enforced by lint, not convention.
2. **Contract purity.** `agent/runtime/types.ts` depends on no `packages/*` port. The usage report
   uses a neutral shape defined in the contract; the Pi resolver maps into it.
3. **One binding point.** The composition root creates and registers the Runtime. Replacing the
   Runtime means adding one implementation directory and changing one composition line. The Host
   never constructs a Runtime.
4. **Capability questions go through the contract.** "Can this model serve?" is answered by the
   Runtime's preflight and static capability surface, not by importing a specific runtime's binding
   logic. Image-generation support stays an AI SDK concern and is not routed through the seam.
5. **Normalized history is the seam currency.** The Host side maps protocol transcripts into the
   normalized Runtime shape; each Runtime maps that shape into its own messages. Neither side
   imports the other's mapping.

## Success Criteria

1. Pi isolation holds repo-wide and is lint-enforced.
2. `agent/runtime/types.ts` has no `packages/*` dependency.
3. Swapping the Runtime touches one new directory plus one composition line.
4. The orchestration core contains protocol orchestration and invariants only; turn preparation
   and attachment materialization are testable without a Host instance.
5. `packages/ai-runtime` is deleted and the desktop-sync trust workflow is retired.
6. Existing Host and Runtime conformance suites stay green through every phase; the invariant list
   in [Agent Protocol](../agent/agent-protocol.md#invariants) is the permanent baseline.

## Migration Status

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | This document; retire the `ai-runtime` desktop-sync trust workflow | Landed |
| 1 | Seal the seam: Runtime binding at the composition root, split the Pi language binding out of `provider/`, neutral usage shape in the contract, language capability query behind `LanguageServingSupport`, Pi-isolation lint rule | Landed |
| 2 | Host decomposition | Partially landed (#696: `turnPreparation.ts`, `turnAttachments.ts`, Pi lifecycle phases). Remaining: converge naming/usage/background-reply behind the turn-observer seam |
| 3 | Fold `generation/` into `AiService`, shrink provider config to its AI SDK consumers, inline the consumed `packages/ai-runtime` symbols, delete the package | Pending |

Phase 1 precedes 2 and 3; the contract shape must settle before code moves against it. Phases 2
and 3 are independent of each other.

## Related

- [Agent Architecture](../agent/README.md) — as-built execution boundary
- [Agent Runtime](../agent/agent-runtime.md) — as-built seam contract and conformance
- [Provider Serving Boundaries](./provider-serving-boundaries.md) — provider control plane and
  serving planes; Phase 1 here continues its staged ownership migration
- [Code Organization](../code-organization.md) — placement rules for the moves above
