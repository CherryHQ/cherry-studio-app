import { CacheService, createInMemoryBackendCacheStorage } from '@/backend/data/CacheService';

const mockLoggerError = jest.fn();

jest.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({ error: (...args: unknown[]) => mockLoggerError(...args) }),
  },
}));

const MEMORY_KEY = 'settings.provider.openai.last_used_key_id' as const;
const PERSIST_KEY = 'internal.persist_probe' as const;

describe('backend CacheService', () => {
  beforeEach(() => {
    mockLoggerError.mockClear();
  });

  test('requires initialization and rejects use after disposal', () => {
    const service = new CacheService(createInMemoryBackendCacheStorage());

    expect(() => service.get(MEMORY_KEY)).toThrow('CacheService is not initialized');
    service.init();
    expect(service.get(MEMORY_KEY)).toBeUndefined();

    service.dispose();
    expect(() => service.get(MEMORY_KEY)).toThrow('CacheService is not initialized');
    expect(() => service.init()).toThrow('CacheService has been disposed');
  });

  test('stores memory values and notifies only on explicit value changes', () => {
    const service = createService();
    const subscriber = jest.fn();
    service.subscribeChange(MEMORY_KEY, subscriber);

    service.set(MEMORY_KEY, 'key-a');
    service.set(MEMORY_KEY, 'key-a', 5_000);
    expect(service.get(MEMORY_KEY)).toBe('key-a');
    expect(service.has(MEMORY_KEY)).toBe(true);
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(subscriber).toHaveBeenCalledWith('key-a', undefined);

    expect(service.delete(MEMORY_KEY)).toBe(true);
    expect(service.has(MEMORY_KEY)).toBe(false);
    expect(subscriber).toHaveBeenLastCalledWith(undefined, 'key-a');
  });

  test('silently evicts expired memory values', () => {
    jest.useFakeTimers({ now: 1_000 });
    try {
      const service = createService();
      const subscriber = jest.fn();
      service.subscribeChange(MEMORY_KEY, subscriber);
      service.set(MEMORY_KEY, 'key-a', 100);

      jest.advanceTimersByTime(101);

      expect(service.get(MEMORY_KEY)).toBeUndefined();
      expect(service.delete(MEMORY_KEY)).toBe(false);
      expect(subscriber).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test('isolates subscriber failures', () => {
    const service = createService();
    const healthySubscriber = jest.fn();
    service.subscribeChange(MEMORY_KEY, () => {
      throw new Error('subscriber failed');
    });
    service.subscribeChange(MEMORY_KEY, healthySubscriber);

    service.set(MEMORY_KEY, 'key-a');

    expect(healthySubscriber).toHaveBeenCalledWith('key-a', undefined);
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
  });

  test('persists backend overrides independently of service lifetime', () => {
    const storage = createInMemoryBackendCacheStorage();
    const first = createService(storage);

    expect(first.getPersist(PERSIST_KEY)).toBe(0);
    expect(first.hasPersist(PERSIST_KEY)).toBe(false);
    first.setPersist(PERSIST_KEY, 42);
    first.dispose();

    const reloaded = createService(storage);
    expect(reloaded.getPersist(PERSIST_KEY)).toBe(42);
    expect(reloaded.hasPersist(PERSIST_KEY)).toBe(true);
  });

  test('persist subscriptions ignore same values and observe reset to default', () => {
    const storage = createInMemoryBackendCacheStorage();
    const service = createService(storage);
    const subscriber = jest.fn();
    service.subscribePersistChange(PERSIST_KEY, subscriber);

    service.setPersist(PERSIST_KEY, 7);
    service.setPersist(PERSIST_KEY, 7);
    service.deletePersist(PERSIST_KEY);

    expect(subscriber).toHaveBeenNthCalledWith(1, 7, 0);
    expect(subscriber).toHaveBeenNthCalledWith(2, 0, 7);
    expect(subscriber).toHaveBeenCalledTimes(2);
    expect(service.getPersist(PERSIST_KEY)).toBe(0);
    expect(service.hasPersist(PERSIST_KEY)).toBe(false);
    expect(storage.getString(PERSIST_KEY)).toBeUndefined();
  });

  test('drops corrupt and unknown persisted entries without affecting defaults', () => {
    const storage = createInMemoryBackendCacheStorage();
    storage.set(PERSIST_KEY, '{not json');
    storage.set('removed.schema_key', JSON.stringify('stale'));

    const service = createService(storage);

    expect(service.getPersist(PERSIST_KEY)).toBe(0);
    expect(storage.getString(PERSIST_KEY)).toBeUndefined();
    expect(storage.getString('removed.schema_key')).toBeUndefined();
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
  });

  test('keeps physically separate backend stores independent', () => {
    const firstStorage = createInMemoryBackendCacheStorage();
    const secondStorage = createInMemoryBackendCacheStorage();
    const first = createService(firstStorage);
    const second = createService(secondStorage);

    first.setPersist(PERSIST_KEY, 9);

    expect(first.getPersist(PERSIST_KEY)).toBe(9);
    expect(second.getPersist(PERSIST_KEY)).toBe(0);
  });
});

function createService(
  storage: ReturnType<
    typeof createInMemoryBackendCacheStorage
  > = createInMemoryBackendCacheStorage(),
): CacheService {
  const service = new CacheService(storage);
  service.init();
  return service;
}
