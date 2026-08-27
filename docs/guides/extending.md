# Extending Cherry Mobile

This is a placement guide for extending the in-process frontend/backend architecture. Prefer an
existing deep module over a new registry or pass-through wrapper. Read
[Code Organization](../references/code-organization.md), the
[Architecture Overview](../references/architecture-overview.md), and
[Data Layer](../references/data/README.md) before introducing a new cross-layer interface.

## Add A Resource Endpoint

1. Put entities and DTO schemas in `src/shared/data` (`@/shared/data`) when both sides need them;
   the data layer is mobile-owned, so add only what mobile code reads.
2. Define the endpoint under `src/shared/data/api/schemas` and add it to `apiSchemas.ts`.
3. Implement simple persistence directly in `src/backend/data/services`.
4. Add an endpoint-family handler under `src/backend/data/api/handlers` and register it in
   `apiHandlers.ts`.
5. Call it from the owning frontend hook or feature through `useQuery`, `useMutation`, or
   `useInfiniteQuery`.
6. Add its key factory under `src/frontend/data/queryKeys` when frontend invalidation or direct
   cache access needs one.

Frontend tests inject an `ApiClient` fake through `DataApiProvider`. Handler and persistence tests
exercise observable endpoint and storage behavior independently.

## Add A Workflow Capability

1. Define or extend a narrow `XxxModule` interface in `src/shared/contracts` only when the behavior
   coordinates multiple steps, projects a backend-owned runtime, owns a caller-scoped session, or
   cannot be expressed as an ordinary resource endpoint.
2. Implement it under `src/backend/services` and keep concrete AI/data/platform dependencies behind
   constructor interfaces.
3. Compose the production implementation in `src/bootstrap/composition/createBackend.ts`.
4. Call it through `useBackendModule(key)` from the owning frontend feature.

Frontend tests inject a workflow fake through `BackendProvider`. Backend tests exercise the same
workflow interface and observable results.

## Add Persistent Data

- Add Drizzle schemas under `src/backend/data/db/schemas` and register them in its barrel.
- Generate and bundle the migration under `src/backend/data/db`.
- Keep Drizzle row types backend-only; expose entities/DTOs from `@/shared/data`.
- Expose frontend access through a Data API endpoint, not a new `Backend` module.
- Keep resource-specific composition in the owning frontend hook or feature, not in shared or
  backend code.

New Agent message-part vocabulary belongs in `packages/universal/src/data/types/uiParts.ts` (the
transitional home of types `packages/ai-runtime` imports); render
dispatch belongs in `src/frontend/components/messages/parts/MessagePartRenderer.tsx`. A new JSON
part does not require a table migration; Agent Session FTS indexes only searchable text parts.

## Add AI Or Backend Service Behavior

Pi conversation adaptation and AI SDK provider/service adapters live under `src/backend/ai`. Device
and third-party capabilities live in their owning domain under `src/backend/services`, such as
`permissions`, `models`, and `webSearch`.
Portable provider/runtime rules belong in `packages/ai-runtime`. General pure helpers used by both
sides belong in `src/shared/utils`
when they are mobile-native, or in `packages/universal/src/utils` when they mirror a desktop helper,
including model capability checks.

Keep a direct Cherry Desktop service counterpart's `Service` name and public methods. Name
mobile-only owners by role: `Module`, `Runtime`, `Session`, `Client`, `Adapter`, or `Manager`; never
add an `Impl` suffix or a forwarding `Service` wrapper. See
[Runtime Ownership](../references/runtime-ownership.md#role-names).

New Agent tools require an application-owned JSON-Schema contract, approval and permission policy,
capability adapter, and Pi `RuntimeTool` projection. Add shared tools to the system capability
catalog; use an Agent-owned binding only for MCP configuration. Follow
[Agent Tools And Controlled Resources](../references/agent/agent-tools-and-resources.md); do not
expose AI SDK `ToolSet` as the Agent Host contract or restore the retired Chat `ToolResolver`.
Provider-native plugins remain provider adapter concerns.

The external web-search stack is a workflow precedent: desktop-aligned provider drivers and
`WebSearchService` under `backend/services`, a narrow `WebSearchModule` for provider checks,
frontend settings, and thin Expo Router routes. Agent turns expose `web_search` and `web_fetch` as
temporary system capabilities selected by the composer for one submission.

### Add A Job Handler

1. Register the payload through `JobRegistry` declaration merging.
2. Implement the typed handler in its owning backend domain.
3. Declare its execution class, recovery policy, idempotency rule, timeout, cancellation behavior,
   and resource scopes.
4. Add it to `JobHandlerRegistry`; a payload declaration alone does not register execution.
5. Use `enqueueTx()` when business intent and work must commit atomically.
6. Expose observation through the Jobs Data API and keep navigation, cache invalidation,
   translation, and user feedback in the frontend owner.

Until resource-scope cancellation intent is persisted, do not register a scoped handler with
`recovery: 'retry'`: a process restart could otherwise revive work cancelled for a deleted resource.
See [Job Runtime](../references/job-runtime.md).

## Add UI

- Route files stay thin under `src/app` and import feature module roots.
- Route-bound UI belongs in `src/frontend/features/<name>`.
- Cross-feature React modules belong in `src/frontend/components` or `src/frontend/hooks` only after
  a second independent owner appears.
- Shared query infrastructure and key factories belong in `src/frontend/data`; resource-specific
  query behavior stays with its frontend owner.
- A feature that owns a backend session, or subscribes to an app-owned runtime, keeps navigation,
  toast, and query invalidation in its frontend provider or hook. Unsubscribing from a runtime is not
  the same as disposing it.

## When To Revisit The Architecture

- A real process or network transport is introduced.
- A capability beyond the `@cherrystudio/universal` mirror must be shared with desktop as a package
  rather than only aligned by vocabulary.
- Explicit tool/plugin assembly grows enough to justify a registry.
