import type { InferUseCacheValue, UseCacheKey } from '../cacheSchemas';
import { DefaultPersistCache, DefaultUseCache } from '../cacheSchemas';
import { deepEqual } from '../cacheUtils';

describe('cache schema defaults', () => {
  test('every memory schema key has a default entry', () => {
    expect(Object.keys(DefaultUseCache)).toEqual([
      'settings.provider.${providerId}.last_used_key_id',
    ]);
  });

  test('every persist schema key has a JSON-safe, non-undefined default', () => {
    for (const [key, value] of Object.entries(DefaultPersistCache)) {
      expect(value).not.toBeUndefined();
      expect(() => JSON.stringify(value)).not.toThrow();
      expect(JSON.parse(JSON.stringify({ [key]: value }))).toEqual({ [key]: value });
    }
  });

  test('type-level: template key expansion accepts concrete instances', () => {
    // Compile-time assertions — verified by `pnpm typecheck`, exercised here so
    // the aliases are used at runtime too.
    const concreteKey: UseCacheKey = 'settings.provider.openai.last_used_key_id';
    const inferredValue: InferUseCacheValue<'settings.provider.openai.last_used_key_id'> = 'k1';

    // @ts-expect-error unknown keys are rejected at compile time
    const badKey: UseCacheKey = 'unknown.key';

    expect(concreteKey).toBe('settings.provider.openai.last_used_key_id');
    expect(typeof inferredValue).toBe('string');
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
});
