# App Bootstrap

`src/bootstrap` is the application's composition root and startup owner. It is the only source
layer allowed to know both concrete backend implementations and frontend providers. It creates one
in-process runtime, makes that runtime ready before opening the app gate, and releases app-lifetime
resources when the root provider unmounts.

Mobile now runs Desktop's lifecycle framework — container, dependency graph, and phases — from
`src/backend/core`. What it does not copy is the Electron process model: two phases (`Gate`,
`PostReady`) instead of Desktop's three, and an `ApplicationHost` that can be replaced in place so
Fast Refresh and service tests get a fresh generation. See
[docs/references/lifecycle/](../../docs/references/lifecycle/).

This directory is what remains outside that framework: the composition root.

| Mobile | Desktop responsibility |
| --- | --- |
| `preboot` | `main/core/preboot`: mandatory global setup before composition |
| `composition` | the workflow surface assembled over host-resolved services |
| `runtime` | application bootstrap/shutdown plus the renderer startup gate |

## Layout

```text
bootstrap/
├── preboot/       # ordered global runtime patches
├── composition/   # concrete backend graph and workflow wiring
├── runtime/       # initialize, ready gate, post-ready work, and dispose
└── index.ts       # public React bootstrap interface
```

The root stays intentionally small. New files belong in one of the three ownership modules; do not
restore flat `create*`, provider, runtime-task, or polyfill files beside `index.ts`.

## Startup Sequence

1. `src/app/_layout.tsx` imports each required `preboot` module for side effects.
2. `AppBootstrapProvider` creates one stable `AppBootstrapRuntime`, which constructs an
   `ApplicationHost` and resolves the services the workflow surface is built over. Construction
   claims nothing; the host is not installed yet.
3. `initialize()` installs the host, running the `Gate` phase — cache, SQLite, preferences — ordered
   by the dependency graph, not by the order written here.
4. Once the React Native startup cover owns the surface, boot theme and i18n initialize behind it.
5. `AppBootstrapGate` opens after required startup work succeeds.
6. Best-effort post-ready tasks start outside the first-paint critical path: the `PostReady` phase
   plus the work no service owns.
7. Provider unmount starts one idempotent asynchronous shutdown. It hand-orders nothing — the host
   tears its services down in reverse dependency order, so the chat and job runtimes drain before
   the database they write through.

## Ownership Rules

- `preboot` owns only mandatory global setup that must run before the runtime is composed.
- `composition` connects host-resolved services into the workflow surface; it does not start
  resources or implement product behavior. A collaborator that owns a resource or needs ordered
  teardown belongs in the container, not here.
- `runtime` owns host construction and installation, the initial-render gate, status, post-ready
  work, and app-lifetime disposal.
- Backend business behavior stays in `src/backend`; frontend navigation, cache updates, translation,
  and user feedback stay in `src/frontend`.
- Resource and workflow interfaces exposed to frontend remain in `src/shared/data` and
  `src/shared/contracts`.
- Do not introduce IPC or compatibility adapters. The ban this line used to place on service
  locators and lifecycle phase registries was lifted: both now exist deliberately, in
  `src/backend/core`, for the reasons the lifecycle docs record.
- Frontend must not call `application.get()`. It reaches the backend through the three providers
  this directory installs, the mobile equivalent of Desktop's renderer/IPC boundary.

`index.ts` exports only the root React integration. Internal composition and runtime functions are
imported from their concrete paths so their ownership remains visible.
