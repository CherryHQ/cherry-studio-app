import { createMMKV } from 'react-native-mmkv';

/**
 * Minimal synchronous key-value abstraction backing the CacheService persist
 * tier. Production uses {@link createMmkvStorage}; tests inject
 * {@link createInMemoryKvStorage}.
 */
export interface KvStorage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
  getAllKeys(): string[];
}

/**
 * MMKV-backed KvStorage for the persist tier. Dedicated instance id so cache
 * data never mixes with other future MMKV uses.
 */
export function createMmkvStorage(): KvStorage {
  const mmkv = createMMKV({ id: 'cherry-cache-persist' });
  return {
    getString: (key) => mmkv.getString(key),
    set: (key, value) => mmkv.set(key, value),
    delete: (key) => {
      mmkv.remove(key);
    },
    getAllKeys: () => mmkv.getAllKeys(),
  };
}

/**
 * Map-backed KvStorage for tests and non-persistent fallbacks.
 */
export function createInMemoryKvStorage(): KvStorage {
  const store = new Map<string, string>();
  return {
    getString: (key) => store.get(key),
    set: (key, value) => {
      store.set(key, value);
    },
    delete: (key) => {
      store.delete(key);
    },
    getAllKeys: () => [...store.keys()],
  };
}
