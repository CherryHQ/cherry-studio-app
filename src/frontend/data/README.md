# Frontend Data

This directory owns the small set of frontend data entry points:

```text
src/frontend/data/
├── BackendProvider.tsx     # workflow-only Backend context and module selector
├── DataApiProvider.tsx     # internal ApiClient injection for endpoint hooks
├── PreferenceProvider.tsx  # internal PreferenceClient injection for preference hooks
├── CacheService.ts         # frontend memory and persisted UI cache
├── QueryProvider.tsx       # React Query client and AppState focus bridge
├── ProviderRegistryQueryBridge.tsx # invalidates model projections after a registry hot-swap
├── queryKeys/              # one file per endpoint family plus the public registry
├── hooks/                  # typed Data API, preference, and cache React bindings
└── __tests__/              # entry-point service/provider tests
```

Resource-specific reads and mutations stay in their owning frontend hooks and call `useQuery`,
`useMutation`, or `useInfiniteQuery`. Those hooks use the injected `ApiClient`; callers never select
a persistence module. Query keys mirror endpoint families with one file each, but the data
directory does not duplicate those endpoints as service or gateway wrappers.

Preferences remain a separate client and hook family, matching Cherry Desktop. `BackendProvider`
is reserved for multi-step workflows and long-lived sessions defined in `shared/contracts`; it is
not a generic data module registry.

Its top-level `CacheService.ts` mirrors Cherry Desktop's renderer-data placement. Mobile keeps only
the renderer-owned memory and persisted UI tiers; cache schemas, types, and pure key helpers remain
under `src/shared/data/cache`, while the MMKV adapter is a private implementation detail of the
service.
`src/backend/data/CacheService.ts` is a separate owner with a separate MMKV store; neither service
calls or imports the other.

It contains no backend business persistence, AI, device, or integration implementations. Shared
entities, endpoint schemas, `ApiClient`, and `PreferenceClient` live in `src/shared/data`; workflow
interfaces live in `src/shared/contracts`.
