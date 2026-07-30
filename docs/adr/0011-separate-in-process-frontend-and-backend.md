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
│   ├── application/      # multi-step product workflows
│   ├── data/             # backend cache, preferences, SQLite, seeders, and persistence services
│   ├── infrastructure/   # AI, device, and third-party adapters
│   ├── utils/            # backend-owned pure helpers
│   └── types/            # backend-specific declarations
├── shared/
│   ├── contracts/        # frontend/backend interfaces, workflow results, and events
│   ├── data/             # API schemas, preferences, entities, and value types
│   ├── domain/           # cross-layer domain rules
│   ├── core/             # cross-layer foundations such as logging
│   └── utils/            # cross-layer pure utilities
└── types/                # truly global and generated declarations only
```

Only `bootstrap` may import both frontend and backend modules. Frontend code depends on backend
behaviour exclusively through `shared/contracts`; it does not import SQLite, Drizzle, AI SDKs,
concrete persistence classes, or device and third-party adapters. Backend code does not import
React UI, Expo Router, TanStack Query, translations, or toast implementations. `app` remains at
the Expo Router-mandated path and imports only bootstrap, frontend, and shared modules.

The `shared/data` vocabulary intentionally follows Cherry Desktop: `types` owns entities,
`preference` owns preference schemas and defaults, and `api` owns DTOs and errors. This alignment
does not make the code a workspace package or introduce desktop runtime coupling.

`MobileBackend` is the stable frontend-facing interface. It groups cohesive modules for
assistants, topics, chat, files, models, providers, paintings, MCP, pins, preferences,
permissions, profile, and web search. Stateful workflows such as chat and painting generation
return sessions whose lifetimes are explicit. Backend workflow results and events describe what
happened; frontend owners translate them into navigation, cache invalidation, and user feedback.

`BackendProvider` holds one stable `MobileBackend` value and exposes only
`useBackendModule(key)`. `AppBootstrapProvider` owns database initialization, boot preferences,
post-ready work, and disposal; its React context exposes only `loading`, `ready`, or `error`.
Because the app is still pre-release, the migration is direct: there is no `DataServices`
compatibility adapter and no generic data hook that can expose the concrete service graph.

Simple persistence classes may directly satisfy a contract. An application implementation is
introduced only when it hides a multi-step rule or coordinates several dependencies. This keeps
the seam deep and avoids a parallel hierarchy of pass-through wrappers.

`backend/application` names a role, not a desktop directory. It is unrelated to Cherry Desktop's
`src/main/core/application`, which is the Electron lifecycle and IoC container. Its desktop
counterparts are distributed across DataApi handlers, Main AI/business modules, and renderer-owned
workflows because those operations cross process responsibilities on desktop. Mobile keeps the
same multi-step rules behind the backend seam instead of moving AI, persistence, or device policy
into frontend hooks.

**Considered Options**

- Keep the feature/runtime layering established by ADR 0010 and rely on import discipline.
- Mirror Cherry Desktop's `main`/`renderer`/`preload` process topology.
- Extract domain and application code into workspace packages for possible desktop reuse.
- Add an in-process frontend/backend seam with one composition root in `bootstrap`.

**Consequences**

The chosen seam makes ownership and test substitution explicit without pretending that a mobile
process boundary exists. A production backend and test fakes can satisfy the same contracts, and
frontend hooks no longer need to mock concrete persistence or AI implementations. Startup and
resource disposal remain centralized in the composition root.

This architecture does **not** provide security isolation, fault isolation, independent deployment,
or protection from blocking the JavaScript thread. Contract values need not be serializable unless
a future decision introduces a real transport. Native modules remain owned by the Expo app, and no
workspace package, database migration, remote service, or IPC layer is created by this decision.

ADR 0009 remains correct in rejecting a desktop process split, but its flat-layout conclusion is
superseded. ADR 0010's feature ownership and import-direction rationale remain, while its top-level
runtime/data/AI/services layout and frontend-visible `DataServices` graph are superseded by this
decision.
