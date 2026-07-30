# Backend Data

This directory is the mobile counterpart of Cherry Desktop's `src/main/data` layer. It owns
business-data persistence and the concrete implementations that read or write that data.

## Structure

- `PreferenceService.ts` owns cached access to SQLite-backed user preferences.
- `db/` owns the Expo SQLite connection, Drizzle schemas, migrations, custom SQL, and seeders.
- `services/` owns entity persistence, managed-file storage, and data-specific transformations.
- `fixtures/` contains development data consumed by the database seeders and their tests.

The concrete graph is assembled only by `src/bootstrap`. Frontend callers see contracts from
`src/shared/contracts`, never these classes.

## Cache

Mobile's current general-purpose `CacheService` is frontend-owned and lives at
`src/frontend/data/CacheService.ts`. It corresponds to Desktop's renderer cache: memory state plus
loseable persisted UI state. Mobile has no multi-window relay and no backend-owned general cache
consumer, so it does not carry an unused counterpart to Desktop's Main `CacheService`.

Domain-specific caches remain private to their owning module, such as MCP tool snapshots. Add a
backend `CacheService` here only when backend-owned, regenerable state has at least one real
consumer and does not belong to Preference or business data.
