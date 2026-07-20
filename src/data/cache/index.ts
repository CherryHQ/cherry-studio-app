export { CacheService, cacheService } from './CacheService';
export type {
  InferUseCacheValue,
  PersistCacheKey,
  PersistCacheSchema,
  UseCacheCasualKey,
  UseCacheKey,
  UseCacheSchema,
} from './cacheSchemas';
export { DefaultPersistCache, DefaultUseCache } from './cacheSchemas';
export type { CacheEntry, CacheStats, CacheSubscriber } from './cacheTypes';
export { deepEqual } from './cacheUtils';
export type { KVStorage } from './kvStorage';
export { createMmkvStorage, InMemoryKVStorage } from './kvStorage';
export {
  findMatchingUseCacheSchemaKey,
  getUseCacheDefaultValue,
  isTemplateKey,
  templateToRegex,
} from './templateKey';
