# Separate The In-Process Frontend And Backend

Cherry Mobile separates product UI from local business and infrastructure logic with an
in-process frontend/backend seam. The separation is structural: both sides still execute in the
same React Native/Hermes runtime, and calls cross a TypeScript interface rather than IPC, HTTP, or
a serialization layer.

The source layout is:

```text
src/
├── app/                  # Expo Router route files
├── bootstrap/            # composition, startup, lifecycle, and polyfills
├── frontend/             # features, components, data, hooks, i18n, styles, utils, types
├── backend/
│   ├── ai/               # AI SDK, providers, MCP runtime, tools, and message conversion
│   ├── data/             # backend cache, preferences, SQLite, seeders, and persistence services
│   ├── services/         # product workflows, platform capabilities, and third-party services
│   ├── utils/            # backend-owned pure helpers
│   └── types/            # backend-specific declarations
├── shared/
│   ├── ai/               # cross-layer AI tool and transport rules
│   ├── contracts/        # workflow/session interfaces, results, and events
│   ├── core/             # cross-layer foundations such as logging
│   ├── data/             # API schemas, preferences, entities, and value types
│   └── utils/            # cross-layer pure utilities
└── types/                # truly global and generated declarations only
```

Only `bootstrap` may import both frontend and backend modules. Frontend code crosses the in-process
seam through interfaces from `shared/data/api`, `shared/data/preference`, or `shared/contracts`; it
does not import SQLite, Drizzle, AI SDKs, concrete persistence classes, or device and third-party
adapters. Backend code does not import React UI, Expo Router, TanStack Query, translations, or toast
implementations. `app` remains at the Expo Router-mandated path and imports only bootstrap,
frontend, and shared modules.

The `shared/data` vocabulary intentionally follows Cherry Desktop: `types` owns entities,
`preference` owns preference schemas, defaults, and the `PreferenceClient` interface, while `api`
owns endpoint DTOs, errors, and the `ApiClient` interface. Mobile's `DataApiService` dispatches that
interface directly to backend handlers in-process instead of using Desktop's preload/IPC transport.
This alignment does not make the code a workspace package or introduce desktop runtime coupling.

`shared/ai` follows Cherry Desktop's placement for cross-layer AI tool and transport rules, while
general model capability helpers live in `shared/utils/model.ts`. `shared/contracts` contains only
mobile workflow and session capabilities that are not ordinary resource endpoints. It is not a
transport or serialization layer.

The frontend has three deliberately separate entry points:

- Resource reads and mutations use `useQuery`, `useMutation`, or `useInfiniteQuery`, backed by an
  `ApiClient` and endpoint definitions in `shared/data/api`.
- Preferences use `usePreference` or `useMultiplePreferences`, backed by a `PreferenceClient` in
  `shared/data/preference`, matching Desktop's separate preference channel.
- Multi-step workflows and long-lived sessions use `useBackendModule(key)` and the workflow-only
  `Backend` interface from `shared/contracts`.

`Backend` groups chat, MCP runtime, model workflows, painting generation, permissions, profile,
provider workflows, and web-search checks. Ordinary assistant, topic, message, file, pin, model,
provider, painting, and MCP persistence operations are Data API endpoints, not `Backend` modules.
Stateful workflows such as chat and painting generation return sessions whose lifetimes are
explicit. Workflow results and events describe what happened; frontend owners translate them into
navigation, cache invalidation, and user feedback.

`BackendProvider`, `DataApiProvider`, and `PreferenceProvider` hold stable implementations of those
three interfaces. Only the typed endpoint hooks can access the raw `ApiClient`, and only preference
hooks can access the raw `PreferenceClient`. `AppBootstrapProvider` owns database initialization,
boot preferences, post-ready work, and disposal; its React context exposes only `loading`, `ready`,
or `error`. Because the app is still pre-release, the migration is direct: there is no
`DataServices` compatibility adapter and no generic module selector for resource persistence.

Simple persistence classes sit behind Data API handlers. A general backend service and workflow
contract are introduced only when they hide a multi-step rule, own a platform or third-party
capability, or coordinate several dependencies. This keeps each interface deep and avoids
pass-through wrappers.

`backend/services` follows Cherry Desktop's `src/main/services` directory vocabulary. The mapping is
by responsibility rather than by file: desktop process boundaries distribute some equivalent
workflows across DataApi handlers, Main AI modules, Main services, and renderer owners. Mobile keeps
those backend-owned rules behind the in-process seam. It does not copy Cherry Desktop's
`src/main/core/application`, which remains an Electron lifecycle and IoC container with no mobile
counterpart.

**Considered Options**

- Keep the feature/runtime layering established by ADR 0010 and rely on import discipline.
- Mirror Cherry Desktop's `main`/`renderer`/`preload` process topology.
- Extract domain and application code into workspace packages for possible desktop reuse.
- Add an in-process frontend/backend seam with one composition root in `bootstrap`.

**Consequences**

The chosen seam makes ownership and test substitution explicit without pretending that a mobile
process boundary exists. Frontend resource tests provide an `ApiClient` fake, preference tests
provide a `PreferenceClient` fake, and workflow tests provide a `Backend` module fake; none need to
mock concrete persistence or AI implementations. Startup and resource disposal remain centralized
in the composition root.

This architecture does **not** provide security isolation, fault isolation, independent deployment,
or protection from blocking the JavaScript thread. Contract values need not be serializable unless
a future decision introduces a real transport. Native modules remain owned by the Expo app, and no
workspace package, database migration, remote service, or IPC layer is created by this decision.

ADR 0009 remains correct in rejecting a desktop process split, but its flat-layout conclusion is
superseded. ADR 0010's feature ownership and import-direction rationale remain, while its top-level
runtime/data/AI/services layout and frontend-visible `DataServices` graph are superseded by this
decision.
