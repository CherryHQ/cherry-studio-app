# App Bootstrap Runtime

Runtime owns the app-lifetime instance assembled at startup and the React gate that controls when
feature UI may render.

## Current Modules

| File | Responsibility |
| --- | --- |
| `createAppBootstrapRuntime.ts` | Creates the stable `Backend`, `ApiClient`, and `PreferenceClient`; defines initialize and dispose ordering |
| `initializeAppRuntime.ts` | Applies cached boot theme and initializes i18n on the startup critical path |
| `runPostReadyTasks.ts` | Repairs crash-orphaned messages and prewarms MCP after the gate opens |
| `AppBootstrapProvider.tsx` | Owns one runtime, injects its interfaces, tracks startup status, and disposes it |
| `AppBootstrapGate.tsx` | Renders nothing while loading and surfaces initialization failure |

## Startup Contract

Required initialization runs in this order:

1. initialize backend cache;
2. initialize SQLite, including migration and seeding;
3. initialize cached preferences;
4. apply the boot theme and initialize i18n;
5. set status to `ready` and open the gate.

Only work required for a correct first render may block the gate. `runPostReadyTasks()` is
fire-and-forget, best-effort, and must handle its own failures. Route data, provider catalogs, chat
history, repairs, diagnostics, and other feature work stay outside the critical path unless a
separate startup decision proves otherwise.

## Ownership Rules

- The provider context exposes only `loading`, `ready`, or `error`; concrete backend objects remain
  behind `BackendProvider`, `DataApiProvider`, and `PreferenceProvider`.
- Runtime may coordinate frontend and backend startup, but it must not implement feature behavior.
- Navigation, toast, translation decisions, and React Query invalidation remain frontend-owned.
- Every app-lifetime resource added here must identify its initialization order and disposal point.
- Runtime must not import app route modules or trigger preboot side effects.
- Mobile uses one startup gate, not Desktop lifecycle phases.
