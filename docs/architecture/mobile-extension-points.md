# Cherry Mobile Extension Points

Status: current

This is a placement guide for extending the in-process frontend/backend architecture. Prefer an
existing deep module over a new registry or pass-through wrapper.

## Add A Resource Endpoint

1. Put entities and DTO schemas in `src/shared/data` when both sides need them.
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

1. Define or extend a narrow interface in `src/shared/contracts` only when the behavior coordinates
   multiple steps, owns a long-lived session, or cannot be expressed as an ordinary resource
   endpoint.
2. Implement it under `src/backend/services` and keep concrete AI/data/platform dependencies behind
   constructor interfaces.
3. Compose the production implementation in `src/bootstrap/composition/createBackend.ts`.
4. Call it through `useBackendModule(key)` from the owning frontend feature.

Frontend tests inject a workflow fake through `BackendProvider`. Backend tests exercise the same
workflow interface and observable results.

## Add Persistent Data

- Add Drizzle schemas under `src/backend/data/db/schemas` and register them in its barrel.
- Generate and bundle the migration under `src/backend/data/db`.
- Keep Drizzle row types backend-only; expose entities/DTOs from `src/shared/data`.
- Expose frontend access through a Data API endpoint, not a new `Backend` module.
- Keep resource-specific composition in the owning frontend hook or feature, not in shared or
  backend code.

New Message Part vocabulary belongs in `src/shared/data/types/uiParts.ts`; render dispatch belongs in
`src/frontend/features/chat/messageContent`. A new JSON part does not require a table migration, but
FTS indexes only text parts.

## Add AI Or Backend Service Behavior

AI SDK adapters live under `src/backend/ai`. Stateful device and third-party capabilities live in
their owning domain under `src/backend/services`, such as `permissions`, `oauth`, and `webSearch`.
Cross-layer AI tool and transport rules belong in `src/shared/ai`. General pure helpers used by
both sides, including model capability checks, belong in `src/shared/utils`.

App-level tools are resolved by `ToolService` and attached in
`src/backend/ai/runtime/aiSdk/params/buildAgentParams.ts`. Provider plugins are
assembled in `buildAgentPlugins.ts`. Add a registry only when the existing explicit assembly becomes
measurably hard to maintain.

The external web-search stack is the full workflow precedent: provider drivers and
`WebSearchService` under `backend/services`, AI tool integration under `backend/ai`, a narrow
`webSearch` workflow contract for provider checks, frontend settings, and thin Expo Router routes.

## Add UI

- Route files stay thin under `src/app` and import feature module roots.
- Route-bound UI belongs in `src/frontend/features/<name>`.
- Cross-feature React modules belong in `src/frontend/components` or `src/frontend/hooks` only after
  a second independent owner appears.
- Shared query infrastructure and key factories belong in `src/frontend/data`; resource-specific
  query behavior stays with its frontend owner.
- A feature that owns a backend session keeps navigation, toast, and query invalidation in its
  frontend Provider or hook.

## Reopen When

- A real process or network transport is introduced.
- A capability must be shared with desktop as a package rather than only aligned by vocabulary.
- Explicit tool/plugin assembly grows enough to justify a registry.
