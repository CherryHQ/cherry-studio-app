# App Bootstrap

`src/bootstrap` is the application's composition root and startup owner. It is the only source
layer allowed to know both concrete backend implementations and frontend providers. It creates one
in-process runtime, makes that runtime ready before opening the app gate, and releases app-lifetime
resources when the root provider unmounts.

Mobile does not copy Cherry Desktop's Electron process, IoC container, or lifecycle phases. The
directory aligns with Desktop by responsibility:

| Mobile | Desktop responsibility |
| --- | --- |
| `preboot` | `main/core/preboot`: mandatory global setup before composition |
| `composition` | service registry and dependency wiring performed during main bootstrap |
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
2. `AppBootstrapProvider` creates one stable `AppBootstrapRuntime`.
3. The runtime initializes cache, SQLite, preferences, boot theme, and i18n in order.
4. `AppBootstrapGate` opens after required startup work succeeds.
5. Best-effort post-ready tasks start outside the first-paint critical path.
6. Provider unmount disposes MCP, web-search state, backend cache, and SQLite.

## Ownership Rules

- `preboot` owns only mandatory global setup that must run before the runtime is composed.
- `composition` creates objects and connects dependencies; it does not start resources or implement
  product behavior.
- `runtime` owns startup ordering, status, the initial-render gate, post-ready work, and app-lifetime
  disposal.
- Backend business behavior stays in `src/backend`; frontend navigation, cache updates, translation,
  and user feedback stay in `src/frontend`.
- Resource and workflow interfaces exposed to frontend remain in `src/shared/data` and
  `src/shared/contracts`.
- Do not introduce service locators, lifecycle phase registries, IPC, or compatibility adapters.

`index.ts` exports only the root React integration. Internal composition and runtime functions are
imported from their concrete paths so their ownership remains visible.
