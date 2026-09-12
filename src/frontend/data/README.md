# Frontend Data

This directory owns the small set of frontend data entry points:

```text
src/frontend/data/
├── BackendProvider.tsx     # workflow-only Backend context and module selector
├── DataApiProvider.tsx     # internal ApiClient injection for endpoint hooks
├── PreferenceProvider.tsx  # internal PreferenceClient injection for preference hooks
├── CacheService.ts         # frontend memory and persisted UI cache
├── QueryProvider.tsx       # React Query client and AppState focus bridge
├── FileQueryBridge.tsx     # invalidates file lists and affected details/content after writes
├── ProviderRegistryQueryBridge.tsx # invalidates model projections after a registry hot-swap
├── queryKeys/              # one file per endpoint family plus the public registry
├── hooks/                  # typed Data API, preference, and cache React bindings
└── __tests__/              # entry-point service/provider tests
```

Resource-specific reads and mutations stay in their owning frontend hooks and call `useQuery`,
`useMutation`, or `useInfiniteQuery`. Those hooks use the injected `ApiClient`; callers never select
a persistence module. Query keys mirror endpoint families with one file each, but the data
directory does not duplicate those endpoints as service or gateway wrappers.

`FileQueryBridge` subscribes to the file workflow's committed changes for the app lifetime.
Managed-file creation, draft rewrites, deletion, and rollback discards all notify through
`fileStorage` with the affected entry id. The bridge invalidates every file-list page size and that
entry's detail, URI, text, and preview caches, including pages containing it. Unchanged files retain
their caches; content refresh does not rely on a draft's timestamp changing. Composer, painting, and
Agent callers only perform their file operation. Library and picker readers reuse fresh pages and
receive updates without owning focus or write refreshes.

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
