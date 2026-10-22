# Frontend Data

This directory owns the small set of frontend data entry points:

```text
src/frontend/data/
├── BackendProvider.tsx     # workflow-only Backend context and module selector
├── DataApiProvider.tsx     # ApiClient injection and batched committed-query invalidation
├── PreferenceProvider.tsx  # internal PreferenceClient injection for preference hooks
├── CacheService.ts         # frontend memory and persisted UI cache
├── QueryProvider.tsx       # React Query client and AppState focus bridge
├── ProviderRegistryQueryBridge.tsx # invalidates model projections, including Agent model names, after a registry hot-swap
├── appUpdate.ts            # GitCode APK update query shared by startup and settings
├── queryKeys/              # one file per endpoint family plus the public registry
├── hooks/                  # typed Data API, preference, and cache React bindings
└── __tests__/              # entry-point service/provider tests
```

Resource-specific reads and mutations stay in their owning frontend hooks and call `useQuery`,
`useMutation`, or `useInfiniteQuery`. Those hooks use the injected `ApiClient`; callers never select
a persistence module. Query keys mirror endpoint families with one file each, but the data
directory does not duplicate those endpoints as service or gateway wrappers. `appUpdate.ts` is the
one exception: the startup observer and the settings row read the same backend workflow result, so
its query options live here instead of in either owner.

`DataApiProvider` owns one app-lifetime subscription to committed Data API changes. Managed-file
creation, rewrites and deletion publish affected entry paths together with resource paths; grouped
trash/restore/purge includes every version in one batch. A 300 ms coalescing window produces one
cache predicate pass for the burst, covering file lists, detail/URI/text/preview keys and page entries.
Painting projections declare referenced IDs in `meta.fileEntryIds`, including currently missing
files. Unrelated file and Session caches remain intact. Workspace rebinding and bound-folder purge
explicitly publish the affected Session paths. Composer, painting and Agent callers only perform
their operations; they do not own refresh, and unmounting a feature does not remove the subscription.

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
