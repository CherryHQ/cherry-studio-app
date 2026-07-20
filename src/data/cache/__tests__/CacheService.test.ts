import { CacheService } from '../CacheService';
import { InMemoryKVStorage } from '../kvStorage';

const PROVIDER_KEY = 'settings.provider.openai.last_used_key_id' as const;

describe('CacheService memory tier', () => {
  let service: CacheService;

  beforeEach(() => {
    service = new CacheService(new InMemoryKVStorage());
  });

  test('set/get roundtrip with typed template key', () => {
    expect(service.get(PROVIDER_KEY)).toBeUndefined();
    service.set(PROVIDER_KEY, 'key-1');
    expect(service.get(PROVIDER_KEY)).toBe('key-1');
    expect(service.has(PROVIDER_KEY)).toBe(true);
  });

  test('casual API stores dynamic keys', () => {
    service.setCasual('my.dynamic.key', { a: 1 });
    expect(service.getCasual<{ a: number }>('my.dynamic.key')).toEqual({ a: 1 });
    expect(service.hasCasual('my.dynamic.key')).toBe(true);
    expect(service.deleteCasual('my.dynamic.key')).toBe(true);
    expect(service.getCasual('my.dynamic.key')).toBeUndefined();
  });

  test('delete removes the entry and tolerates missing keys', () => {
    service.set(PROVIDER_KEY, 'key-1');
    expect(service.delete(PROVIDER_KEY)).toBe(true);
    expect(service.get(PROVIDER_KEY)).toBeUndefined();
    expect(service.delete(PROVIDER_KEY)).toBe(true);
  });

  test('delete is refused while a hook references the key', () => {
    service.set(PROVIDER_KEY, 'key-1');
    service.registerHook(PROVIDER_KEY);
    expect(service.delete(PROVIDER_KEY)).toBe(false);
    expect(service.get(PROVIDER_KEY)).toBe('key-1');

    service.unregisterHook(PROVIDER_KEY);
    expect(service.delete(PROVIDER_KEY)).toBe(true);
  });

  test('hook reference counting requires all hooks to unregister', () => {
    service.registerHook(PROVIDER_KEY);
    service.registerHook(PROVIDER_KEY);
    service.unregisterHook(PROVIDER_KEY);
    expect(service.delete(PROVIDER_KEY)).toBe(false);
    service.unregisterHook(PROVIDER_KEY);
    expect(service.delete(PROVIDER_KEY)).toBe(true);
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
    const unsubscribe = service.subscribe(PROVIDER_KEY, subscriber);

    service.set(PROVIDER_KEY, 'key-1');
    expect(subscriber).toHaveBeenCalledTimes(1);

    unsubscribe();
    service.set(PROVIDER_KEY, 'key-2');
    expect(subscriber).toHaveBeenCalledTimes(1);
  });

  test('a throwing subscriber does not break other subscribers', () => {
    const broken = jest.fn(() => {
      throw new Error('boom');
    });
    const healthy = jest.fn();
    service.subscribe(PROVIDER_KEY, broken);
    service.subscribe(PROVIDER_KEY, healthy);

    service.set(PROVIDER_KEY, 'key-1');
    expect(broken).toHaveBeenCalledTimes(1);
    expect(healthy).toHaveBeenCalledTimes(1);
  });
});

describe('CacheService TTL', () => {
  let service: CacheService;

  beforeEach(() => {
    jest.useFakeTimers();
    service = new CacheService(new InMemoryKVStorage());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('entries expire lazily after their TTL', () => {
    service.set(PROVIDER_KEY, 'key-1', 1000);
    expect(service.get(PROVIDER_KEY)).toBe('key-1');
    expect(service.hasTTL(PROVIDER_KEY)).toBe(true);

    jest.advanceTimersByTime(1001);
    expect(service.has(PROVIDER_KEY)).toBe(false);
    expect(service.get(PROVIDER_KEY)).toBeUndefined();
  });

  test('expiry on read notifies subscribers', () => {
    const subscriber = jest.fn();
    service.set(PROVIDER_KEY, 'key-1', 1000);
    service.subscribe(PROVIDER_KEY, subscriber);

    jest.advanceTimersByTime(1001);
    expect(service.get(PROVIDER_KEY)).toBeUndefined();
    expect(subscriber).toHaveBeenCalledTimes(1);
  });

  test('same-value set still refreshes the TTL', () => {
    service.set(PROVIDER_KEY, 'key-1', 1000);
    jest.advanceTimersByTime(900);
    service.set(PROVIDER_KEY, 'key-1', 1000);

    jest.advanceTimersByTime(900);
    expect(service.get(PROVIDER_KEY)).toBe('key-1');

    jest.advanceTimersByTime(200);
    expect(service.get(PROVIDER_KEY)).toBeUndefined();
  });

  test('set without TTL clears a previous TTL', () => {
    service.set(PROVIDER_KEY, 'key-1', 1000);
    service.set(PROVIDER_KEY, 'key-1');
    expect(service.hasTTL(PROVIDER_KEY)).toBe(false);

    jest.advanceTimersByTime(2000);
    expect(service.get(PROVIDER_KEY)).toBe('key-1');
  });
});

describe('CacheService persist tier', () => {
  test('getPersist falls back to schema default and never returns undefined', () => {
    const service = new CacheService(new InMemoryKVStorage());
    expect(service.getPersist('internal.persist_probe')).toBe(0);
    expect(service.hasPersist('internal.persist_probe')).toBe(false);
  });

  test('setPersist writes through and survives a "restart" on the same storage', () => {
    const storage = new InMemoryKVStorage();
    const service = new CacheService(storage);

    service.setPersist('internal.persist_probe', 42);
    expect(service.getPersist('internal.persist_probe')).toBe(42);
    expect(service.hasPersist('internal.persist_probe')).toBe(true);

    const reloaded = new CacheService(storage);
    expect(reloaded.getPersist('internal.persist_probe')).toBe(42);
  });

  test('setPersist notifies subscribers and skips no-op writes', () => {
    const service = new CacheService(new InMemoryKVStorage());
    const subscriber = jest.fn();
    service.subscribe('internal.persist_probe', subscriber);

    service.setPersist('internal.persist_probe', 42);
    expect(subscriber).toHaveBeenCalledTimes(1);

    service.setPersist('internal.persist_probe', 42);
    expect(subscriber).toHaveBeenCalledTimes(1);
  });

  test('setting the default value removes the stored entry (absent = default)', () => {
    const storage = new InMemoryKVStorage();
    const service = new CacheService(storage);

    service.setPersist('internal.persist_probe', 42);
    expect(storage.getAllKeys()).toContain('internal.persist_probe');

    service.setPersist('internal.persist_probe', 0);
    expect(storage.getAllKeys()).not.toContain('internal.persist_probe');
    expect(service.getPersist('internal.persist_probe')).toBe(0);
  });

  test('deletePersist resets to the schema default', () => {
    const storage = new InMemoryKVStorage();
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

  test('a corrupted stored entry falls back to default and is dropped', () => {
    const storage = new InMemoryKVStorage();
    storage.set('internal.persist_probe', '{not json');

    const service = new CacheService(storage);
    expect(service.getPersist('internal.persist_probe')).toBe(0);
    expect(storage.getAllKeys()).not.toContain('internal.persist_probe');
  });

  test('storage keys that left the schema are pruned on load', () => {
    const storage = new InMemoryKVStorage();
    storage.set('legacy.removed_key', JSON.stringify('stale'));

    new CacheService(storage);
    expect(storage.getAllKeys()).not.toContain('legacy.removed_key');
  });
});

describe('CacheService getStats', () => {
  test('reports per-tier counts and details', () => {
    jest.useFakeTimers();
    try {
      const service = new CacheService(new InMemoryKVStorage());
      service.set(PROVIDER_KEY, 'key-1');
      service.setCasual('temp.expiring_key', 'x', 1000);
      service.registerHook(PROVIDER_KEY);
      jest.advanceTimersByTime(1001);

      const stats = service.getStats(true);
      expect(stats.summary.memory.totalCount).toBe(2);
      expect(stats.summary.memory.validCount).toBe(1);
      expect(stats.summary.memory.expiredCount).toBe(1);
      expect(stats.summary.memory.withTTLCount).toBe(1);
      expect(stats.summary.memory.hookReferences).toBe(1);
      expect(stats.summary.persist.totalCount).toBe(1);
      expect(stats.summary.total.estimatedBytes).toBeGreaterThan(0);
      expect(stats.details.memory).toHaveLength(2);
      expect(stats.details.persist).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
