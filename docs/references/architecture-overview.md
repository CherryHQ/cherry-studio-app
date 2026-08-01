# Architecture Overview

This is the entry point for Cherry Studio Mobile architecture. Domain language lives in
[Domain Language](./domain-language.md), and implementation detail lives in the topic documents
below.

## Scope

Cherry Mobile runs in one React Native/Hermes runtime. It has an enforced in-process
frontend/backend seam, not Electron processes, IPC, HTTP, independent deployment, or security
isolation.

The separation is structural: calls cross TypeScript interfaces rather than a transport or
serialization layer. It improves dependency direction and test substitution, but does not provide
fault isolation or protection from blocking the JavaScript thread. Contract values may include
`AbortSignal`, callbacks, subscriptions, errors, and session objects.

## Source Ownership

| Directory | Owner |
|---|---|
| `src/app` | Thin Expo Router route files |
| `src/bootstrap/preboot` | Ordered global runtime patches required before composition |
| `src/bootstrap/composition` | Concrete backend graph and workflow wiring |
| `src/bootstrap/runtime` | Initialization, startup gate, splash, post-ready work, and disposal |
| `src/frontend` | Features, components, React Query, hooks, i18n, styles, UI utils and types |
| `src/backend/ai` | AI SDK, provider adapters, MCP runtime, tools, and message conversion |
| `src/backend/data` | Backend cache, preferences, SQLite, schemas, seeders, fixtures, and persistence services |
| `src/backend/services` | Multi-step workflows, device capabilities, OAuth, avatars, and web search |
| `src/shared/contracts` | Workflow-only `Backend` modules, sessions, events, and results |
| `src/shared/core` / `src/shared/utils` | Cross-layer foundations and mobile-native pure utilities |
| `src/types` | Truly global or generated declarations only |
| `packages/universal/src/ai` | Cross-layer AI tool and transport rules (`@cherrystudio/universal/ai`) |
| `packages/universal/src/data` | Entities, endpoint DTOs, `ApiClient`, preferences, `PreferenceClient`, cache schemas, and data errors (`@cherrystudio/universal/data`) |
| `packages/universal/src/{types,utils}` | Portable desktop-mirrored types and pure helpers (`@cherrystudio/universal/{types,utils}`) |

Only `bootstrap` may import both frontend and backend. Frontend resource data uses typed Data API
hooks and `@cherrystudio/universal/data/api`; preferences use the separate
`@cherrystudio/universal/data/preference` client; workflows use `useBackendModule(key)` and
`@/shared/contracts`. Frontend never imports SQLite, Drizzle, AI SDK, or concrete device and
persistence implementations. ESLint enforces these directions.

Inside backend, static imports flow from `ai` to `services` or `data`, and from `services` to `data`;
`data` imports neither general services nor AI. A workflow service that needs AI receives a narrow
constructor interface, and bootstrap supplies the concrete implementation.

`app` imports only bootstrap, frontend, and shared modules. Backend does not import React UI, Expo
Router, TanStack Query, translations, or toast implementations. Shared modules do not import upper
layers. The layout follows Cherry Desktop vocabulary where responsibilities match without copying
its process topology, lifecycle framework, or dependency-injection container.

## Frontend Interfaces

- Resource CRUD and pagination use typed React Query hooks backed by `ApiClient` from
  `@cherrystudio/universal/data/api`.
- Preference reads, writes, and subscriptions use `PreferenceClient` from
  `@cherrystudio/universal/data/preference`.
- Multi-step workflows and long-lived sessions use `useBackendModule(key)` and the workflow-only
  `Backend` from `@/shared/contracts`.

`DataApiService` dispatches resource calls directly to backend handlers in-process. Workflow events
and results describe what happened; frontend owners perform navigation, cache invalidation,
translation, and user feedback. Concrete backend classes never enter frontend state, and there is no
compatibility adapter or generic frontend selector for persistence services.

## Topic Documents

- [Data Layer](./data/README.md): Data API, preferences, workflow contracts, SQLite services, schemas, and seeding.
- [Universal Package](./universal-package.md): `@cherrystudio/universal` scope, admission criteria, aliasing, and desktop sync.
- [Storage Engine](./data/storage-engine.md): current SQLite constraints and migration criteria.
- [Runtime Ownership](./runtime-ownership.md): app bootstrap, sessions, cleanup, and startup gates.
- [AI Provider Integration](./ai/provider-integration.md): provider/model records and AI adapters.
- [Chat Streaming And Rendering](./chat/streaming-and-rendering.md): `ChatSession`, overlay, and persistence.
- [Web Search](./web-search.md): external providers versus provider-native web search.
- [Navigation And Insets](./navigation-and-insets.md): Expo Router, tabs, stacks, sheets, and insets.
- [UI Components](./ui-components.md): shared controls and feature-local UI.
- [Extending Cherry Mobile](../guides/extending.md): how to extend data, workflows, backend behavior, and UI.

## Current Baseline

- `AppBootstrapProvider` owns one `AppBootstrapRuntime`; its context exposes startup status only.
- `DataApiProvider` supplies `ApiClient` only to endpoint hooks; resource callers use
  `useQuery`/`useMutation`/`useInfiniteQuery`.
- `PreferenceProvider` supplies the separate `PreferenceClient` only to preference hooks.
- `BackendProvider` holds the workflow-only `Backend` and exposes `useBackendModule(key)`.
- `frontend/data` owns these providers, `QueryProvider`, endpoint query keys, data/preference/cache
  hooks, and the frontend `CacheService`.
- `backend/data` owns an independent backend `CacheService` used by the private service graph.
- `shared/data` owns frontend/backend data vocabulary; database rows remain under `backend/data`.
- Chat and painting generation use explicit backend sessions with `dispose` and abort behavior.
- Navigation, translation, toast, and React Query invalidation stay in frontend owners.
- `expo-screen-corner-radius` remains the bottom-sheet device adapter; context menus use Expo UI directly.

Simple persistence classes sit behind Data API handlers. A workflow contract is introduced only
when it hides meaningful orchestration, lifetime, platform, or third-party complexity.
