// Narrow public surface (naming-conventions §6.4): only what callers outside
// src/data/cache actually consume. The hooks in src/data/hooks/useCache.ts are
// the hook-side half of this infrastructure and import leaf files directly,
// mirroring the desktop layout; schema defaults, template helpers, deepEqual,
// and the MMKV adapter stay internal.
export { CacheService, cacheService } from './CacheService';
export type {
  InferUseCacheValue,
  PersistCacheKey,
  PersistCacheSchema,
  UseCacheKey,
  UseCacheSchema,
} from './cacheSchemas';
export type { CacheStats } from './cacheTypes';
export type { KvStorage } from './kvStorage';
export { createInMemoryKvStorage } from './kvStorage';
