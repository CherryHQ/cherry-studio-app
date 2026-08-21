import { BaseService, DependsOn, Injectable } from '@/backend/core/lifecycle';
import type { DbService } from '@/backend/data/db/DbService';
import { preferenceTable } from '@/backend/data/db/schemas';
import {
  getDefaultValue,
  getPreferenceKeys,
  isPreferenceKey,
  PreferenceDefaults,
  type PreferenceClient,
  type PreferenceSchema,
  type PreferenceKeyType,
  type PreferenceUpdateOptions,
} from '@/shared/data/preference';

type PreferenceListener = () => void;
type PreferenceValue = PreferenceSchema[PreferenceKeyType];
type PreferenceUpdates<K extends PreferenceKeyType = PreferenceKeyType> = Partial<
  Pick<PreferenceSchema, K>
>;
type PreferenceRawResult<K extends PreferenceKeyType> = {
  [P in K]: PreferenceSchema[P];
};
type PreferenceMapping = Record<string, PreferenceKeyType>;
type PreferenceMappedResult<T extends PreferenceMapping> = {
  [P in keyof T]: PreferenceSchema[T[P]];
};
type PreferenceUpdateMap = Partial<Record<PreferenceKeyType, PreferenceValue>>;

const defaultUpdateOptions: PreferenceUpdateOptions = {
  optimistic: true,
};

/**
 * Mobile PreferenceService providing cached access to SQLite-backed preferences.
 *
 * Features:
 * - In-memory cache initialized from defaults and database values
 * - Optimistic and pessimistic update strategies
 * - Batch operations for multiple preferences
 * - Integration with React's useSyncExternalStore
 */
@Injectable('PreferenceService')
@DependsOn(['DbService'])
export class PreferenceService extends BaseService implements PreferenceClient {
  private cache: PreferenceUpdateMap = { ...PreferenceDefaults };
  private listeners = new Map<PreferenceKeyType, Set<PreferenceListener>>();
  private updateTail: Promise<void> = Promise.resolve();

  constructor(private readonly dbService: DbService) {
    super();
  }

  private get db() {
    return this.dbService.getDb();
  }

  /**
   * Loads every stored preference into the cache. This is a `Gate` service
   * because first paint reads theme, font size, and language straight out of
   * that cache — see `initializeAppRuntime`.
   */
  protected async onInit() {
    this.cache = { ...PreferenceDefaults };

    const rows = await this.db
      .select({
        key: preferenceTable.key,
        value: preferenceTable.value,
      })
      .from(preferenceTable);

    for (const row of rows) {
      if (isPreferenceKey(row.key)) {
        this.cache[row.key] = row.value as PreferenceValue;
      }
    }
  }

  async get<K extends PreferenceKeyType>(key: K): Promise<PreferenceSchema[K]> {
    return this.getCachedValue(key) ?? getDefaultValue(key);
  }

  getCachedValue<K extends PreferenceKeyType>(key: K): PreferenceSchema[K] | undefined {
    return this.cache[key] as PreferenceSchema[K] | undefined;
  }

  readCached<K extends PreferenceKeyType>(key: K): PreferenceSchema[K] {
    return this.getCachedValue(key) ?? getDefaultValue(key);
  }

  async getMultipleRaw<K extends PreferenceKeyType>(
    keys: readonly K[],
  ): Promise<PreferenceRawResult<K>> {
    return this.getMultipleRawCached(keys);
  }

  getMultipleRawCached<K extends PreferenceKeyType>(keys: readonly K[]): PreferenceRawResult<K> {
    const result = {} as PreferenceRawResult<K>;

    for (const key of keys) {
      result[key] = this.getCachedValue(key) ?? getDefaultValue(key);
    }

    return result;
  }

  getMultiple<T extends PreferenceMapping>(mapping: T): PreferenceMappedResult<T> {
    return this.getMultipleCached(mapping);
  }

  getMultipleCached<T extends PreferenceMapping>(mapping: T): PreferenceMappedResult<T> {
    const result = {} as PreferenceMappedResult<T>;

    for (const name of Object.keys(mapping) as (keyof T)[]) {
      const key = mapping[name];
      result[name] = this.getCachedValue(key) ?? getDefaultValue(key);
    }

    return result;
  }

  getAll(): PreferenceSchema {
    return {
      ...PreferenceDefaults,
      ...this.cache,
    } as PreferenceSchema;
  }

  async set<K extends PreferenceKeyType>(
    key: K,
    value: PreferenceSchema[K],
    options: PreferenceUpdateOptions = defaultUpdateOptions,
  ) {
    await this.setMultiple({ [key]: value } as PreferenceUpdates<K>, options);
  }

  async setMultiple<K extends PreferenceKeyType>(
    updates: PreferenceUpdates<K>,
    options: PreferenceUpdateOptions = defaultUpdateOptions,
  ) {
    await this.enqueueUpdate(updates as PreferenceUpdateMap, options);
  }

  subscribeChange<K extends PreferenceKeyType>(key: K) {
    return (listener: PreferenceListener) => {
      const listeners = this.listeners.get(key) ?? new Set<PreferenceListener>();
      listeners.add(listener);
      this.listeners.set(key, listeners);

      return () => {
        listeners.delete(listener);

        if (listeners.size === 0) {
          this.listeners.delete(key);
        }
      };
    };
  }

  private enqueueUpdate(updates: PreferenceUpdateMap, options: PreferenceUpdateOptions) {
    const run = this.updateTail.then(() => this.runUpdate(updates, options));
    this.updateTail = run.catch(() => {});

    return run;
  }

  private async runUpdate(updates: PreferenceUpdateMap, options: PreferenceUpdateOptions) {
    const keys = this.getChangedKeys(updates);

    if (keys.length === 0) {
      return;
    }

    const previousValues = this.pickCachedValues(keys);

    if (options.optimistic) {
      this.applyUpdates(updates, keys);
    }

    try {
      await this.persistUpdates(updates, keys);

      if (!options.optimistic) {
        this.applyUpdates(updates, keys);
      }
    } catch (error) {
      if (options.optimistic) {
        this.restoreValues(previousValues, keys);
      }

      throw error;
    }
  }

  private getUpdateKeys(updates: PreferenceUpdateMap) {
    return getPreferenceKeys().filter((key) => key in updates && updates[key] !== undefined);
  }

  private getChangedKeys(updates: PreferenceUpdateMap) {
    return this.getUpdateKeys(updates).filter((key) => {
      const value = updates[key] as PreferenceValue;
      const currentValue = this.getCachedValue(key) ?? getDefaultValue(key);

      return !isPreferenceValueEqual(currentValue, value);
    });
  }

  private pickCachedValues(keys: PreferenceKeyType[]) {
    const values: PreferenceUpdateMap = {};

    for (const key of keys) {
      values[key] = this.getCachedValue(key) ?? getDefaultValue(key);
    }

    return values;
  }

  private applyUpdates(updates: PreferenceUpdateMap, keys: PreferenceKeyType[]) {
    for (const key of keys) {
      this.cache[key] = updates[key];
    }

    this.notify(keys);
  }

  private restoreValues(values: PreferenceUpdateMap, keys: PreferenceKeyType[]) {
    for (const key of keys) {
      this.cache[key] = values[key];
    }

    this.notify(keys);
  }

  private async persistUpdates(updates: PreferenceUpdateMap, keys: PreferenceKeyType[]) {
    await this.dbService.withWriteTx(async (tx) => {
      for (const key of keys) {
        const value = updates[key] as PreferenceValue;

        // react-doctor-disable-next-line async-await-in-loop -- expo-sqlite 写事务内本质串行，并行化无收益
        await tx
          .insert(preferenceTable)
          .values({ key, value })
          .onConflictDoUpdate({ target: preferenceTable.key, set: { value } });
      }
    });
  }

  private notify(keys: PreferenceKeyType[]) {
    for (const key of keys) {
      const listeners = this.listeners.get(key);

      if (!listeners) {
        continue;
      }

      for (const listener of listeners) {
        listener();
      }
    }
  }
}

function isPreferenceValueEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (!isComparableObject(left) || !isComparableObject(right)) {
    return false;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((item, index) => isPreferenceValueEqual(item, right[index]));
  }

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every(
    (key, index) =>
      key === rightKeys[index] &&
      isPreferenceValueEqual(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
      ),
  );
}

function isComparableObject(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === 'object' && value !== null;
}
