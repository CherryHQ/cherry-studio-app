import type { AgentReplayCacheStorage } from '../AgentReplayCache';

/** Shared backing data survives recreation of the cache owner, like MMKV on restart. */
export function createReplayCacheStorage() {
  const values = new Map<string, string>();
  const getString = jest.fn((key: string) => values.get(key));
  const storage: AgentReplayCacheStorage = {
    getString,
    getAllKeys: () => [...values.keys()],
    set: (key, value) => {
      values.set(key, value);
    },
    remove: (key) => {
      values.delete(key);
    },
    clearAll: () => values.clear(),
    trim: () => {},
  };
  return { storage, values, getString };
}
