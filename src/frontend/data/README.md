# Frontend Data

This directory owns frontend access to `MobileBackend`: the module provider, React Query keys and
client, and React hooks that bind backend contracts to UI state.

Its top-level `CacheService.ts` mirrors Cherry Desktop's renderer-data placement. Mobile keeps only
the renderer-owned memory and persisted UI tiers; cache schemas and pure key helpers remain under
`src/shared/data/cache`, while the MMKV adapter stays frontend-owned in `kvStorage.ts`.

It contains no persistence, AI, device, or integration implementations. Shared entities and DTO
schemas live in `src/shared/data`; workflow interfaces live in `src/shared/contracts`.
