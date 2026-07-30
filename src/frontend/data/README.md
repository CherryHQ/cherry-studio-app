# Frontend Data

This directory owns the small set of frontend data entry points:

```text
src/frontend/data/
├── BackendProvider.tsx   # stable MobileBackend context and module selector
├── CacheService.ts       # frontend memory and persisted UI cache
├── QueryProvider.tsx     # React Query client and AppState focus bridge
├── queryKeys/            # one file per backend endpoint family plus the public registry
├── hooks/                # cache and preference React bindings
└── __tests__/            # entry-point service/provider tests
```

Resource-specific reads and mutations stay in their owning frontend hooks and call a narrow
`MobileBackend` module. Query keys mirror endpoint families with one file each, but the data
directory does not duplicate those endpoints as service or gateway wrappers.

Its top-level `CacheService.ts` mirrors Cherry Desktop's renderer-data placement. Mobile keeps only
the renderer-owned memory and persisted UI tiers; cache schemas, types, and pure key helpers remain
under `src/shared/data/cache`, while the MMKV adapter is a private implementation detail of the
service.
`src/backend/data/CacheService.ts` is a separate owner with a separate MMKV store; neither service
calls or imports the other.

It contains no backend business persistence, AI, device, or integration implementations. Shared
entities and DTO schemas live in `src/shared/data`; workflow interfaces live in
`src/shared/contracts`.
