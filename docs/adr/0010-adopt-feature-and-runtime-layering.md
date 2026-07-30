# Adopt Feature And Runtime Layering

Cherry Mobile reorganizes `src/` into an explicit layered layout: a new `src/runtime/` tier owns the composition root (`createDataServices`), `DataProvider`, `InitialDataGate`, and app bootstrap (`appRuntime`); a new `src/features/<name>/` tier absorbs the former `src/screens/*Screen` directories (chat, topics, messages, assistants, paintings, settings, search, home, onboarding) with the screen component at the feature root; `src/data/` becomes a pure data layer; and `src/services/` groups platform/integration services (`webSearch`, `devicePermissions`, `cherryin`, `avatars`). This exercises the reopen clause recorded in ADR 0009: the injected runtime graph had scattered across `data/services/`, `data/runtime/`, `data/bootstrap/`, and its wiring reached upward into `src/ai` and `src/services` — the layering inversion ADR 0009 said would trigger extraction of a shared runtime layer.

Two dependency defects motivated acting now rather than tolerating further drift:

- `src/data/services/createDataServices.ts` constructed `AiService`, `McpService`, `ToolService`, `WebSearchService`, and `DevicePermissionService` — the data layer instantiating every layer above it. The composition root now lives in `src/runtime/`, which is allowed to see all layers.
- `src/ai` and `src/services` value-imported each other (`ai/tools` → `services/webSearch`; `services/webSearch` → `ai/utils/provider` for `defaultAppHeaders`). The shared constant moved to `src/config`, fixing the direction to `ai → services` only.

Import direction is now enforced by ESLint (`import/no-restricted-paths` plus type-aware restricted imports) instead of discipline alone: `data` sees no upper layer, `ai` and `services` see no UI, features do not deep-import each other past their public surface (`@/features/<f>` and `@/features/<f>/<area>`), and nothing outside `src/app` imports routes.

**Considered Options**

- Keep the flat layout (ADR 0009 status quo) and fix only the two dependency defects in place.
- Adopt desktop's `main`/`renderer`/`shared` process split.
- Extract a runtime tier and regroup screens into features, keeping shared UI (`components/`), shared hooks (`hooks/`), `ai/`, `data/`, and `services/` as top-level layers aligned with desktop's `main/{ai,data,services,features}` vocabulary.

**Consequences**

ADR 0009 is superseded in its "keep flat layout" conclusion but its core rationale stands: a React Native app has no process boundary, so `main`/`renderer`/`preload` and an `ipc/` tier remain explicitly rejected. Screen-internal organization (`<area>/{components,hooks,utils,__tests__}` per the former `src/screens/README.md`) carries over unchanged as the feature-internal template. `features/chat/input` becomes a sanctioned public surface because paintings legitimately composes the chat input; the former cross-screen deep imports are collapsed onto it. Shared hooks used by multiple features (`hooks/chat`, `hooks/mcp`, `useAvatar`, `useExclusiveSwipeable`, `useShaderClock`) stay in `src/hooks`; single-feature hooks live in that feature. The cost is a large one-time rename (~600 files touched) and retraining muscle memory for `@/screens/...` paths; the boundary rules exist so the structure cannot silently regress.
