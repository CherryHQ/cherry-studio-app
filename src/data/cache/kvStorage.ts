import { createMMKV } from 'react-native-mmkv';

/**
 * Minimal synchronous key-value abstraction backing the CacheService persist
 * tier. Production uses {@link createMmkvStorage}; tests inject
 * {@link InMemoryKVStorage}.
 */
export interface KVStorage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
  getAllKeys(): string[];
}

/**
 * MMKV-backed KVStorage for the persist tier. Dedicated instance id so cache
 * data never mixes with other future MMKV uses.
 */
export function createMmkvStorage(): KVStorage {
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
 * Map-backed KVStorage for tests and non-persistent fallbacks.
 */
export class InMemoryKVStorage implements KVStorage {
  private store = new Map<string, string>();

  getString(key: string): string | undefined {
    return this.store.get(key);
  }

  set(key: string, value: string): void {
    this.store.set(key, value);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  getAllKeys(): string[] {
    return [...this.store.keys()];
  }
}
