import type {
  BackendCacheKey,
  InferBackendCacheValue,
  InferUseCacheValue,
  UseCacheKey,
} from '../cacheSchemas';
import { DefaultBackendPersistCache, DefaultPersistCache, DefaultUseCache } from '../cacheSchemas';
import { deepEqual } from '../cacheUtils';

describe('cache schema defaults', () => {
  test('every memory schema key has a default entry', () => {
    expect(Object.keys(DefaultUseCache)).toEqual(['internal.memory_probe.${instanceId}']);
  });

  test('every persist schema key has a JSON-safe, non-undefined default', () => {
    for (const defaults of [DefaultPersistCache, DefaultBackendPersistCache]) {
      for (const [key, value] of Object.entries(defaults)) {
        expect(value).not.toBeUndefined();
        expect(() => JSON.stringify(value)).not.toThrow();
        expect(JSON.parse(JSON.stringify({ [key]: value }))).toEqual({ [key]: value });
      }
    }
  });

  test('type-level: template key expansion accepts concrete instances', () => {
    // Compile-time assertions — verified by `pnpm typecheck`, exercised here so
    // the aliases are used at runtime too.
    const concreteKey: UseCacheKey = 'internal.memory_probe.frontend';
    const inferredValue: InferUseCacheValue<'internal.memory_probe.frontend'> = 'ready';
    const backendKey: BackendCacheKey = 'settings.provider.openai.last_used_key_id';
    const backendValue: InferBackendCacheValue<'settings.provider.openai.last_used_key_id'> = 'k1';

    // @ts-expect-error unknown keys are rejected at compile time
    const badKey: UseCacheKey = 'unknown.key';

    expect(concreteKey).toBe('internal.memory_probe.frontend');
    expect(typeof inferredValue).toBe('string');
    expect(backendKey).toBe('settings.provider.openai.last_used_key_id');
    expect(typeof backendValue).toBe('string');
    expect(badKey).toBe('unknown.key');
  });
});

describe('deepEqual', () => {
  test('primitives and Object.is semantics', () => {
    expect(deepEqual('a', 'a')).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual(NaN, NaN)).toBe(true);
    expect(deepEqual(null, undefined)).toBe(false);
  });

  test('deep object and array content equality', () => {
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual({}, [])).toBe(false);
  });

  test('key order does not matter, extra keys do', () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  test('non-plain objects compare unequal unless reference-identical', () => {
    const date = new Date(1000);
    expect(deepEqual(date, date)).toBe(true);
    expect(deepEqual(new Date(1000), new Date(1000))).toBe(false);
    expect(deepEqual(new Map(), new Map())).toBe(false);
    expect(deepEqual(new Set([1]), new Set([1]))).toBe(false);
    expect(deepEqual({ a: new Date(1000) }, { a: new Date(1000) })).toBe(false);
  });
});
