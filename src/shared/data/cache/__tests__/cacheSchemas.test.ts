import type {
  BackendCacheKey,
  InferBackendCacheValue,
  InferUseCacheValue,
  UseCacheKey,
} from '../cacheSchemas';
import { DefaultBackendPersistCache, DefaultPersistCache, DefaultUseCache } from '../cacheSchemas';

describe('cache schema defaults', () => {
  test('every memory schema key has a default entry', () => {
    expect(Object.keys(DefaultUseCache)).toEqual([
      'chat.scroll_anchor.${sessionId}',
      'internal.memory_probe.${instanceId}',
    ]);
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
    const scrollKey: UseCacheKey = 'chat.scroll_anchor.session-1';
    const scrollAnchor: InferUseCacheValue<'chat.scroll_anchor.session-1'> = {
      key: 'message-1',
      offset: 12,
    };
    const backendKey: BackendCacheKey = 'settings.provider.openai.last_used_key_id';
    const backendValue: InferBackendCacheValue<'settings.provider.openai.last_used_key_id'> = 'k1';

    // @ts-expect-error unknown keys are rejected at compile time
    const badKey: UseCacheKey = 'unknown.key';

    expect(concreteKey).toBe('internal.memory_probe.frontend');
    expect(typeof inferredValue).toBe('string');
    expect(scrollKey).toBe('chat.scroll_anchor.session-1');
    expect(scrollAnchor).toEqual({ key: 'message-1', offset: 12 });
    expect(backendKey).toBe('settings.provider.openai.last_used_key_id');
    expect(typeof backendValue).toBe('string');
    expect(badKey).toBe('unknown.key');
  });
});
