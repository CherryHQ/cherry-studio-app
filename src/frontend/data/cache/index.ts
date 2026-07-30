// Narrow public surface (naming-conventions §6.4): only what callers outside
// frontend/data/cache consume. React hooks are the hook-side half of this
// frontend-owned module; schema definitions stay in shared/data/cache.

export type {
  InferUseCacheValue,
  PersistCacheKey,
  PersistCacheSchema,
  UseCacheKey,
  UseCacheSchema,
} from '@/shared/data/cache/cacheSchemas';
export { CacheService, cacheService } from './CacheService';
export type { CacheStats } from './cacheTypes';
export type { KvStorage } from './kvStorage';
export { createInMemoryKvStorage } from './kvStorage';
