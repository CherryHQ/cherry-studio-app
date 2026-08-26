# Lifecycle Migration

> Status: Historical implementation record. The active contracts live in
> [lifecycle-overview.md](./lifecycle-overview.md) and
> [resource-scope.md](./resource-scope.md).

## Landed Sequence

| Stage | Result |
| --- | --- |
| A | Added the lifecycle framework, decorators, host orchestration, and layer rules without wiring production services |
| B | Moved app-owned resources into the central service registry and made bootstrap install one `ApplicationHost` |
| D | Added resource fencing/draining and routed painting deletion through it |
| C | Moved CRUD persistence services to the host-owned database boundary |

The framework landed before its first integration so each layer remained reviewable. The current
registry lives in `src/backend/core/application/serviceRegistry.ts`; the old Assistant/Topic/Message
runtime and persistence services have since been removed rather than retained as lifecycle owners.

## Placement Decisions

```text
src/backend/core/lifecycle/     lifecycle primitives and manager
src/backend/core/application/   global application reference, host, and registry
src/backend/core/resources/     domain-neutral scope fencing and draining
```

- `backend/core` cannot import `backend/ai`, `backend/services`, or `backend/data`.
- `serviceRegistry.ts` is the only assembly exception because it imports concrete constructors.
- Frontend code never calls `application.get()`; it uses workflow modules, Data API hooks, or
  preference hooks.
- No barrel re-exports the registry because doing so would pull the concrete graph into every core
  consumer.

## Mobile Divergences

- Mobile uses `Gate` and `PostReady` rather than Electron readiness phases.
- IPC helpers and the process-exit shutdown fuse are not ported.
- Every platform resolves the same service keys; iOS-only capabilities use no-op adapters elsewhere.
- An `ApplicationHost` represents one replaceable generation so tests and Fast Refresh do not share
  live resources.

## Current Acceptance Contract

- Gate failures abort startup; PostReady failures are logged without extending first paint.
- Dependency order controls startup, and reverse dependency order controls teardown.
- App shutdown drains Agent turns and durable jobs before SQLite closes.
- Painting deletion fences the painting, cancels an active generation once, waits for terminal
  persistence, and then deletes.
- A drain timeout leaves the mutation unrun and reports the straggling operation.
- Process restart reconciles unfinished Agent turns and durable jobs without relying on teardown.

Local verification policy and CI ownership are defined in
[Testing And CI](../../guides/testing-and-ci.md).
