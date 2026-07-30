# Cherry Mobile Architecture Index

Status: current

This is the entry point for Cherry Studio Mobile architecture. Domain language lives in
[CONTEXT.md](../../CONTEXT.md), decisions live under [docs/adr](../adr), and implementation detail
lives in the topic documents below.

## Scope

Cherry Mobile runs in one React Native/Hermes runtime. It has an enforced in-process
frontend/backend seam, not Electron processes, IPC, HTTP, independent deployment, or security
isolation. See [ADR 0011](../adr/0011-separate-in-process-frontend-and-backend.md).

## Source Ownership

| Directory | Owner |
|---|---|
| `src/app` | Thin Expo Router route files |
| `src/bootstrap` | Composition root, initialization, lifecycle, splash, and polyfills |
| `src/frontend` | Features, components, React Query, hooks, i18n, styles, UI utils and types |
| `src/backend/application` | Multi-step product workflows behind shared contracts |
| `src/backend/infrastructure` | SQLite, AI SDK, device APIs, storage, and integrations |
| `src/shared/contracts` | `MobileBackend`, module interfaces, sessions, events, and workflow results |
| `src/shared/data` | Entities, DTO schemas, preferences, cache schemas, and data errors |
| `src/shared/domain` | Platform-independent domain rules |
| `src/shared/core` / `src/shared/utils` | Cross-layer foundations and pure utilities |
| `src/types` | Truly global or generated declarations only |

Only `bootstrap` may import both frontend and backend. Frontend calls backend behavior through
`useBackendModule(key)` and types from `shared/contracts`; it never imports SQLite, Drizzle, AI SDK,
or concrete device and persistence implementations. ESLint enforces these directions.

## Topic Documents

- [Data Layer](./mobile-data-layer.md): contracts, frontend data, SQLite services, schemas, and seeding.
- [Runtime Ownership](./mobile-runtime-ownership.md): app bootstrap, sessions, cleanup, and startup gates.
- [AI Provider Integration](./mobile-ai-provider-integration.md): provider/model records and AI adapters.
- [Chat Streaming And Rendering](./mobile-chat-streaming-rendering.md): `ChatSession`, overlay, and persistence.
- [Web Search](./mobile-web-search.md): external providers versus provider-native web search.
- [Navigation And Insets](./mobile-navigation-and-insets.md): Expo Router, tabs, stacks, sheets, and insets.
- [UI Components](./mobile-ui-components.md): shared controls and feature-local UI.
- [Extension Points](./mobile-extension-points.md): how to extend contracts, backend workflows, and UI.

## Decision Index

- [ADR 0001: Use Provider-Owned Runtime Owners](../adr/0001-use-provider-owned-runtime-owners.md)
- [ADR 0002: Use Startup Gates Instead Of Lifecycle Phases](../adr/0002-use-startup-gates-not-lifecycle-phases.md)
- [ADR 0003: Use Pressable Wrappers For Product Buttons](../adr/0003-use-pressable-wrappers-for-product-buttons.md)
- [ADR 0004: Use Expo Runtime Fetch For Chat Streaming](../adr/0004-use-expo-runtime-fetch-for-chat-streaming.md)
- [ADR 0005: Preserve Message Part Rendering Boundaries](../adr/0005-preserve-message-part-rendering-boundaries.md)
- [ADR 0006: Use Platform-Native Navigation Gestures](../adr/0006-use-platform-native-navigation-gestures.md)
- [ADR 0007: Use Component Bottom Sheets For Model Picker](../adr/0007-use-component-bottom-sheets-for-model-picker.md)
- [ADR 0008: Defer op-sqlite Storage Migration](../adr/0008-defer-op-sqlite-storage-migration.md)
- [ADR 0009: Keep Flat src Layout](../adr/0009-keep-flat-src-layout.md), superseded in part
- [ADR 0010: Adopt Feature And Runtime Layering](../adr/0010-adopt-feature-and-runtime-layering.md), superseded in part
- [ADR 0011: Separate The In-Process Frontend And Backend](../adr/0011-separate-in-process-frontend-and-backend.md)

## Current Baseline

- `AppBootstrapProvider` owns one `AppBootstrapRuntime`; its context exposes startup status only.
- `BackendProvider` holds one stable `MobileBackend` and exposes only `useBackendModule(key)`.
- `frontend/data` owns React Query keys/client, backend-bound query functions, preferences hooks, and UI cache.
- `shared/data` owns frontend/backend data vocabulary; database rows remain backend infrastructure.
- Chat and painting generation use explicit backend sessions with `dispose` and abort behavior.
- Navigation, translation, toast, and React Query invalidation stay in frontend owners.
- `expo-screen-corner-radius` remains the bottom-sheet device adapter; context menus use Expo UI directly.
