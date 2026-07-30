# Cherry Mobile Extension Points

Status: current

This is a placement guide for extending the in-process frontend/backend architecture. Prefer an
existing deep module over a new registry or pass-through wrapper.

## Add A Backend Capability

1. Put entities and DTO schemas in `src/shared/data` when both sides need them.
2. Define or extend the narrow module interface in `src/shared/contracts`.
3. Implement simple persistence directly in `src/backend/data/services`.
4. Add a `src/backend/application` module only for multi-step rules or coordinated dependencies.
5. Compose the production implementation in `src/bootstrap/createMobileBackend.ts`.
6. Call it from `src/frontend/data` or the owning feature through `useBackendModule(key)`.

Frontend tests inject a fake module through `BackendProvider`. Backend application tests exercise
the same shared interface and observable results.

## Add Persistent Data

- Add Drizzle schemas under `src/backend/data/db/schemas` and register them in its barrel.
- Generate and bundle the migration under `src/backend/data/db`.
- Keep Drizzle row types backend-only; expose entities/DTOs from `src/shared/data`.
- Add query keys and query functions in `src/frontend/data`, not in shared or backend code.

New Message Part vocabulary belongs in `src/shared/data/types/uiParts.ts`; render dispatch belongs in
`src/frontend/features/chat/messageContent`. A new JSON part does not require a table migration, but
FTS indexes only text parts.

## Add AI Or Integration Behavior

AI SDK adapters live under `src/backend/infrastructure/ai`; device and third-party adapters live
under `src/backend/infrastructure/integrations`. Pure model/domain rules used by both sides belong in
`src/shared/domain`.

App-level tools are resolved by `ToolService` and attached in
`src/backend/infrastructure/ai/runtime/aiSdk/params/buildAgentParams.ts`. Provider plugins are
assembled in `buildAgentPlugins.ts`. Add a registry only when the existing explicit assembly becomes
measurably hard to maintain.

The external web-search stack is the full precedent: infrastructure drivers and `WebSearchService`,
AI tool integration, a `webSearch` backend contract, frontend settings, and thin Expo Router routes.

## Add UI

- Route files stay thin under `src/app` and import feature module roots.
- Route-bound UI belongs in `src/frontend/features/<name>`.
- Cross-feature React modules belong in `src/frontend/components` or `src/frontend/hooks` only after
  a second independent owner appears.
- UI persistence/query code belongs in `src/frontend/data`.
- A feature that owns a backend session keeps navigation, toast, and query invalidation in its
  frontend Provider or hook.

## Reopen When

- A real process or network transport is introduced.
- A capability must be shared with desktop as a package rather than only aligned by vocabulary.
- Explicit tool/plugin assembly grows enough to justify a registry.
