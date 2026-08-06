# Backend Data

This directory is the mobile counterpart of Cherry Desktop's `src/main/data` layer. It owns
business-data persistence and the concrete implementations that read or write that data.

## Structure

- `CacheService.ts` owns backend memory, loseable persisted cache state, and its private MMKV
  adapter.
- `PreferenceService.ts` owns cached access to SQLite-backed user preferences.
- `db/` owns the Expo SQLite connection, Drizzle schemas, migrations, custom SQL, and seeders.
- `services/` owns entity persistence and data-specific transformations.
- `fixtures/` contains development data consumed by the database seeders and their tests.

The concrete graph is assembled only by `src/bootstrap`. Frontend resource callers see endpoint
definitions and `ApiClient` from `src/shared/data/api`; preference callers see `PreferenceClient`
from `src/shared/data/preference`; workflow callers see `src/shared/contracts`. They never see these
classes.

## Cache

Mobile keeps two independent cache owners, matching Desktop's renderer/Main data ownership:

- `src/frontend/data/CacheService.ts` owns frontend memory state and loseable persisted UI state.
- `src/backend/data/CacheService.ts` owns backend memory state and a separate backend persist tier.

The backend service is the mobile counterpart of Desktop Main's `CacheService`. Provider API-key
rotation is its first memory-cache consumer. Its persist tier uses the independent
`cherry-backend-cache-persist` MMKV store, so frontend and backend values cannot collide.

Electron-only shared-cache relay, BrowserWindow synchronization, and IPC handlers do not apply in
the single Hermes runtime and are intentionally absent. Cache initialization and disposal belong to
`src/bootstrap`; the service remains private to the concrete backend graph and is not part of
`ApiClient`, `PreferenceClient`, or `Backend`.

Domain-specific caches that need stronger invariants remain private to their owning module, such as
MCP tool snapshots. User configuration and durable business records still belong in preferences or
SQLite rather than either cache tier.
