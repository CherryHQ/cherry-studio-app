import { DefaultPersistCache } from '@/shared/data/cache/cacheSchemas';

import { CacheService, createInMemoryKvStorage } from '../CacheService';

const MEMORY_KEY = 'internal.memory_probe.frontend' as const;

describe('CacheService memory tier', () => {
  let service: CacheService;

  beforeEach(() => {
    service = new CacheService(createInMemoryKvStorage());
  });

  test('set/get roundtrip with typed template key', () => {
    expect(service.get(MEMORY_KEY)).toBeUndefined();
    service.set(MEMORY_KEY, 'key-1');
    expect(service.get(MEMORY_KEY)).toBe('key-1');
    expect(service.has(MEMORY_KEY)).toBe(true);
  });

  test('casual API stores dynamic keys', () => {
    service.setCasual('my.dynamic.key', { a: 1 });
    expect(service.getCasual<{ a: number }>('my.dynamic.key')).toEqual({ a: 1 });
    expect(service.hasCasual('my.dynamic.key')).toBe(true);
    expect(service.deleteCasual('my.dynamic.key')).toBe(true);
    expect(service.getCasual('my.dynamic.key')).toBeUndefined();
  });

  test('delete removes the entry and tolerates missing keys', () => {
    service.set(MEMORY_KEY, 'key-1');
    expect(service.delete(MEMORY_KEY)).toBe(true);
    expect(service.get(MEMORY_KEY)).toBeUndefined();
    expect(service.delete(MEMORY_KEY)).toBe(true);
  });

  test('delete is refused while a hook references the key', () => {
    service.set(MEMORY_KEY, 'key-1');
    service.registerHook(MEMORY_KEY);
    expect(service.delete(MEMORY_KEY)).toBe(false);
    expect(service.get(MEMORY_KEY)).toBe('key-1');

    service.unregisterHook(MEMORY_KEY);
    expect(service.delete(MEMORY_KEY)).toBe(true);
  });

  test('hook reference counting requires all hooks to unregister', () => {
    service.registerHook(MEMORY_KEY);
    service.registerHook(MEMORY_KEY);
    service.unregisterHook(MEMORY_KEY);
    expect(service.delete(MEMORY_KEY)).toBe(false);
    service.unregisterHook(MEMORY_KEY);
    expect(service.delete(MEMORY_KEY)).toBe(true);
  });

  test('deep-equal set is a no-op and does not notify subscribers', () => {
    const subscriber = jest.fn();
    service.setCasual('some.object.key', { list: [1, 2] });
    service.subscribe('some.object.key', subscriber);

    service.setCasual('some.object.key', { list: [1, 2] });
    expect(subscriber).not.toHaveBeenCalled();

    service.setCasual('some.object.key', { list: [1, 2, 3] });
    expect(subscriber).toHaveBeenCalledTimes(1);
  });

  test('subscribers are notified on set and can unsubscribe', () => {
    const subscriber = jest.fn();
    const unsubscribe = service.subscribe(MEMORY_KEY, subscriber);

    service.set(MEMORY_KEY, 'key-1');
    expect(subscriber).toHaveBeenCalledTimes(1);

    unsubscribe();
    service.set(MEMORY_KEY, 'key-2');
    expect(subscriber).toHaveBeenCalledTimes(1);
  });

  test('a throwing subscriber does not break other subscribers', () => {
    const broken = jest.fn(() => {
      throw new Error('boom');
    });
    const healthy = jest.fn();
    service.subscribe(MEMORY_KEY, broken);
    service.subscribe(MEMORY_KEY, healthy);

    service.set(MEMORY_KEY, 'key-1');
    expect(broken).toHaveBeenCalledTimes(1);
    expect(healthy).toHaveBeenCalledTimes(1);
  });
});

describe('CacheService TTL', () => {
  let service: CacheService;

  beforeEach(() => {
    jest.useFakeTimers();
    service = new CacheService(createInMemoryKvStorage());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('entries expire lazily after their TTL', () => {
    service.set(MEMORY_KEY, 'key-1', 1000);
    expect(service.get(MEMORY_KEY)).toBe('key-1');
    expect(service.hasTTL(MEMORY_KEY)).toBe(true);

    jest.advanceTimersByTime(1001);
    expect(service.has(MEMORY_KEY)).toBe(false);
    expect(service.get(MEMORY_KEY)).toBeUndefined();
  });

  test('expiry on read notifies subscribers', () => {
    const subscriber = jest.fn();
    service.set(MEMORY_KEY, 'key-1', 1000);
    service.subscribe(MEMORY_KEY, subscriber);

    jest.advanceTimersByTime(1001);
    expect(service.get(MEMORY_KEY)).toBeUndefined();
    expect(subscriber).toHaveBeenCalledTimes(1);
  });

  test('same-value set still refreshes the TTL', () => {
    service.set(MEMORY_KEY, 'key-1', 1000);
    jest.advanceTimersByTime(900);
    service.set(MEMORY_KEY, 'key-1', 1000);

    jest.advanceTimersByTime(900);
    expect(service.get(MEMORY_KEY)).toBe('key-1');

    jest.advanceTimersByTime(200);
    expect(service.get(MEMORY_KEY)).toBeUndefined();
  });

  test('set without TTL clears a previous TTL', () => {
    service.set(MEMORY_KEY, 'key-1', 1000);
    service.set(MEMORY_KEY, 'key-1');
    expect(service.hasTTL(MEMORY_KEY)).toBe(false);

    jest.advanceTimersByTime(2000);
    expect(service.get(MEMORY_KEY)).toBe('key-1');
  });
});

describe('CacheService persist tier', () => {
  test('getPersist falls back to schema default and never returns undefined', () => {
    const service = new CacheService(createInMemoryKvStorage());
    expect(service.getPersist('internal.persist_probe')).toBe(0);
    expect(service.hasPersist('internal.persist_probe')).toBe(false);
  });

  test('setPersist writes through and survives a "restart" on the same storage', () => {
    const storage = createInMemoryKvStorage();
    const service = new CacheService(storage);

    service.setPersist('internal.persist_probe', 42);
    expect(service.getPersist('internal.persist_probe')).toBe(42);
    expect(service.hasPersist('internal.persist_probe')).toBe(true);

    const reloaded = new CacheService(storage);
    expect(reloaded.getPersist('internal.persist_probe')).toBe(42);
  });

  test('setPersist notifies subscribers and skips no-op writes', () => {
    const service = new CacheService(createInMemoryKvStorage());
    const subscriber = jest.fn();
    service.subscribe('internal.persist_probe', subscriber);

    service.setPersist('internal.persist_probe', 42);
    expect(subscriber).toHaveBeenCalledTimes(1);

    service.setPersist('internal.persist_probe', 42);
    expect(subscriber).toHaveBeenCalledTimes(1);
  });

  test('setting the default value removes the stored entry (absent = default)', () => {
    const storage = createInMemoryKvStorage();
    const service = new CacheService(storage);

    service.setPersist('internal.persist_probe', 42);
    expect(storage.getAllKeys()).toContain('internal.persist_probe');

    service.setPersist('internal.persist_probe', 0);
    expect(storage.getAllKeys()).not.toContain('internal.persist_probe');
    expect(service.getPersist('internal.persist_probe')).toBe(0);
  });

  test('deletePersist resets to the schema default', () => {
    const storage = createInMemoryKvStorage();
    const service = new CacheService(storage);
    const subscriber = jest.fn();
    service.subscribe('internal.persist_probe', subscriber);

    service.setPersist('internal.persist_probe', 7);
    service.deletePersist('internal.persist_probe');

    expect(service.getPersist('internal.persist_probe')).toBe(0);
    expect(service.hasPersist('internal.persist_probe')).toBe(false);
    expect(storage.getAllKeys()).not.toContain('internal.persist_probe');
    expect(subscriber).toHaveBeenCalledTimes(2);
  });

  test('a failed storage write self-heals on a same-value retry', () => {
    const storage = createInMemoryKvStorage();
    const originalSet = storage.set.bind(storage);
    let failNext = true;
    storage.set = (key, value) => {
      if (failNext) {
        failNext = false;
        throw new Error('mmkv write failed');
      }
      originalSet(key, value);
    };
    const service = new CacheService(storage);

    service.setPersist('internal.persist_probe', 42);
    expect(service.getPersist('internal.persist_probe')).toBe(42);
    expect(storage.getAllKeys()).not.toContain('internal.persist_probe');

    // Same-value retry must not be short-circuited away from storage
    service.setPersist('internal.persist_probe', 42);
    expect(storage.getAllKeys()).toContain('internal.persist_probe');
    expect(new CacheService(storage).getPersist('internal.persist_probe')).toBe(42);
  });

  test('a stale stored entry equal to the default is physically removed', () => {
    const storage = createInMemoryKvStorage();
    // e.g. an override persisted before a schema-default change made it default-equal
    storage.set('internal.persist_probe', JSON.stringify(0));

    const service = new CacheService(storage);
    service.deletePersist('internal.persist_probe');

    expect(storage.getAllKeys()).not.toContain('internal.persist_probe');
    expect(service.getPersist('internal.persist_probe')).toBe(0);
  });

  test('a corrupted stored entry falls back to default and is dropped', () => {
    const storage = createInMemoryKvStorage();
    storage.set('internal.persist_probe', '{not json');

    const service = new CacheService(storage);
    expect(service.getPersist('internal.persist_probe')).toBe(0);
    expect(storage.getAllKeys()).not.toContain('internal.persist_probe');
  });

  test('storage keys that left the schema are pruned on load', () => {
    const storage = createInMemoryKvStorage();
    storage.set('legacy.removed_key', JSON.stringify('stale'));

    new CacheService(storage);
    expect(storage.getAllKeys()).not.toContain('legacy.removed_key');
  });
});

describe('CacheService getStats', () => {
  test('reports per-tier counts and details', () => {
    jest.useFakeTimers();
    try {
      const service = new CacheService(createInMemoryKvStorage());
      service.set(MEMORY_KEY, 'key-1');
      service.setCasual('temp.expiring_key', 'x', 1000);
      service.registerHook(MEMORY_KEY);
      jest.advanceTimersByTime(1001);

      const stats = service.getStats(true);
      const persistKeyCount = Object.keys(DefaultPersistCache).length;
      expect(stats.summary.memory.totalCount).toBe(2);
      expect(stats.summary.memory.validCount).toBe(1);
      expect(stats.summary.memory.expiredCount).toBe(1);
      expect(stats.summary.memory.withTTLCount).toBe(1);
      expect(stats.summary.memory.hookReferences).toBe(1);
      expect(stats.summary.persist.totalCount).toBe(persistKeyCount);
      expect(stats.summary.total.estimatedBytes).toBeGreaterThan(0);
      expect(stats.details.memory).toHaveLength(2);
      expect(stats.details.persist).toHaveLength(persistKeyCount);
    } finally {
      jest.useRealTimers();
    }
  });
});
