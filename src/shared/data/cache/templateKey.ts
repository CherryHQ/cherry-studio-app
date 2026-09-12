import type { InferUseCacheValue, UseCacheKey, UseCacheSchema } from './cacheSchemas';
import { DefaultUseCache } from './cacheSchemas';

/**
 * Checks if a schema key is a template key (contains `${...}` placeholder).
 *
 * @example
 * ```ts
 * isTemplateKey('scroll.position.${id}')  // true
 * isTemplateKey('app.user.avatar')        // false
 * ```
 */
export function isTemplateKey(key: string): boolean {
  return key.includes('${') && key.includes('}');
}

/**
 * Converts a template key pattern into a RegExp for matching concrete keys.
 *
 * Each `${variable}` placeholder expands to `([\w\-]+)` — matches the same
 * character set permitted by the cache key naming convention (ASCII word
 * chars plus hyphens). Non-ASCII characters, dots, and colons are rejected
 * by design: dots are structural separators. The placeholder variable name
 * itself is ignored at runtime.
 *
 * @example
 * ```ts
 * const regex = templateToRegex('scroll.position.${id}')
 * regex.test('scroll.position.topic123')   // true
 * regex.test('scroll.position.topic-123')  // true
 * regex.test('scroll.position.')           // false
 * regex.test('other.key.123')              // false
 * ```
 */
export function templateToRegex(template: string): RegExp {
  const escaped = template.replace(/[.*+?^${}()|[\]\\]/g, (match) => {
    if (match === '$' || match === '{' || match === '}') {
      return match;
    }
    return `\\${match}`;
  });

  const pattern = escaped.replace(/\$\{[^}]+\}/g, '([\\w\\-]+)');

  return new RegExp(`^${pattern}$`);
}

/**
 * Finds the memory-cache schema key that matches a given concrete key.
 *
 * First checks for exact match (fixed keys), then checks template patterns.
 * Returns the exact schema key (fixed or template pattern), not the concrete
 * instance — callers use it to look up the template's default value.
 *
 * @example
 * ```typescript
 * findMatchingUseCacheSchemaKey('internal.memory_probe.frontend')
 * // -> 'internal.memory_probe.${instanceId}'
 * findMatchingUseCacheSchemaKey('unknown.key')  // undefined
 * ```
 */
export function findMatchingUseCacheSchemaKey(key: string): keyof UseCacheSchema | undefined {
  if (key in DefaultUseCache) {
    return key as keyof UseCacheSchema;
  }

  const schemaKeys = Object.keys(DefaultUseCache) as (keyof UseCacheSchema)[];
  for (const schemaKey of schemaKeys) {
    if (isTemplateKey(schemaKey as string)) {
      const regex = templateToRegex(schemaKey as string);
      if (regex.test(key)) {
        return schemaKey;
      }
    }
  }

  return undefined;
}

/**
 * Gets the default value for a memory-cache key from the schema.
 *
 * Works with both fixed keys (direct lookup) and concrete keys that match
 * template patterns (finds template, returns its default). Template default
 * values are shared across all instances — e.g. all
 * `internal.memory_probe.*` keys fall back to the single default `''`.
 */
export function getUseCacheDefaultValue<K extends UseCacheKey>(
  key: K,
): InferUseCacheValue<K> | undefined {
  const schemaKey = findMatchingUseCacheSchemaKey(key);
  if (schemaKey) {
    return DefaultUseCache[schemaKey] as InferUseCacheValue<K>;
  }
  return undefined;
}
