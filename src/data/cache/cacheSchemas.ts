/**
 * Cache Schema Definitions
 *
 * Ported from desktop `src/shared/data/cache/cacheSchemas.ts`. Mobile has no
 * multi-window shared tier, so desktop `SharedCacheSchema` entries that mobile
 * needs get folded into {@link UseCacheSchema} (memory tier) instead.
 *
 * ## Key Naming Convention
 *
 * All cache keys (fixed and template) MUST follow the format: `namespace.sub.key_name`
 *
 * Rules:
 * - At least 2 segments separated by dots (.)
 * - Each segment uses lowercase letters, numbers, and underscores only
 * - Pattern: /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/
 * - Template placeholders `${xxx}` are treated as literal string segments
 *
 * Examples:
 * - 'app.path.resources' (valid)
 * - 'chat.multi_select_mode' (valid)
 * - 'scroll.position.${topicId}' (valid template key)
 * - 'userAvatar' (invalid - missing dot separator)
 * - 'App.user' (invalid - uppercase not allowed)
 * - 'scroll.position:${id}' (invalid - colon not allowed)
 *
 * Desktop enforces this via the `data-schema-key/valid-key` ESLint rule; mobile
 * has no such rule yet, so the convention is upheld by review.
 *
 * ## Template Key Support
 *
 * Template keys allow type-safe dynamic keys using template literal syntax.
 * Define in schema with `${variable}` placeholder, use with actual values.
 * Template keys follow the same dot-separated pattern as fixed keys.
 *
 * Examples:
 * - Schema: `'scroll.position.${topicId}': number`
 * - Usage: `cacheService.get('scroll.position.topic123')` -> infers `number` type
 *
 * Multiple placeholders are supported:
 * - Schema: `'entity.cache.${type}_${id}': CacheData`
 * - Usage: `cacheService.get('entity.cache.user_456')` -> infers `CacheData` type
 */

// ============================================================================
// Template Key Type Utilities
// ============================================================================

/**
 * Detects whether a key string contains template placeholder syntax.
 *
 * Template keys use `${variable}` syntax to define dynamic segments.
 * This type returns `true` if the key contains at least one `${...}` placeholder.
 *
 * @template K - The key string to check
 * @returns `true` if K contains `${...}`, `false` otherwise
 *
 * @example
 * ```typescript
 * type Test1 = IsTemplateKey<'scroll.position.${id}'>     // true
 * type Test2 = IsTemplateKey<'entity.cache.${a}_${b}'>    // true
 * type Test3 = IsTemplateKey<'app.path.resources'>        // false
 * ```
 */
export type IsTemplateKey<K extends string> = K extends `${string}\${${string}}${string}`
  ? true
  : false;

/**
 * Expands a template key pattern into a matching literal type.
 *
 * Replaces each `${variable}` placeholder with `string`, allowing
 * TypeScript to match concrete keys against the template pattern.
 * Recursively processes multiple placeholders.
 *
 * @template T - The template key pattern to expand
 * @returns A template literal type that matches all valid concrete keys
 *
 * @example
 * ```typescript
 * type Test1 = ExpandTemplateKey<'scroll.position.${id}'>
 * // Result: `scroll.position.${string}` (matches 'scroll.position.123', etc.)
 *
 * type Test2 = ExpandTemplateKey<'entity.cache.${type}_${id}'>
 * // Result: `entity.cache.${string}_${string}` (matches 'entity.cache.user_123', etc.)
 *
 * type Test3 = ExpandTemplateKey<'app.path.resources'>
 * // Result: 'app.path.resources' (unchanged for non-template keys)
 * ```
 */
export type ExpandTemplateKey<T extends string> =
  T extends `${infer Prefix}\${${string}}${infer Suffix}`
    ? `${Prefix}${string}${ExpandTemplateKey<Suffix>}`
    : T;

/**
 * Processes a cache key, expanding template patterns if present.
 *
 * For template keys (containing `${...}`), returns the expanded pattern.
 * For fixed keys, returns the key unchanged.
 *
 * @template K - The key to process
 * @returns The processed key type (expanded if template, unchanged if fixed)
 *
 * @example
 * ```typescript
 * type Test1 = ProcessKey<'scroll.position.${id}'>  // `scroll.position.${string}`
 * type Test2 = ProcessKey<'app.path.resources'>     // 'app.path.resources'
 * ```
 */
export type ProcessKey<K extends string> = IsTemplateKey<K> extends true ? ExpandTemplateKey<K> : K;

// ============================================================================
// Memory Cache Schema
// ============================================================================

/**
 * Memory cache schema (TTL-capable, lost on app restart).
 */
export type UseCacheSchema = {
  // LLM provider API key round-robin state, keyed per provider. Aligned with
  // the desktop main-process ProviderService cache key of the same name.
  'settings.provider.${providerId}.last_used_key_id': string;
};

// PascalCase kept verbatim from the desktop export of the same name (like
// DefaultPreferences in the preference domain) so schema entries port with
// zero rewrites — deliberate exception to the UPPER_SNAKE_CASE constant rule.
export const DefaultUseCache: UseCacheSchema = {
  'settings.provider.${providerId}.last_used_key_id': '',
};

// ============================================================================
// Persist Cache Schema
// ============================================================================

/**
 * Persist cache schema defining allowed keys and their value types (fixed keys
 * only, no TTL). Values MUST be JSON-serializable (no Date/Map/Set/undefined)
 * and defaults must not be `undefined` — the backing store round-trips every
 * value through JSON.
 *
 * Division of labor vs. preferences: `PreferenceService` (SQLite) holds
 * user-visible configuration; this tier holds recoverable UI state that merely
 * benefits from surviving a restart.
 */
export type PersistCacheSchema = {
  // Persist-layer self-test key: exercises the typed persist API and round-trip
  // tests for the generic mechanism, independent of any real consumer.
  'internal.persist_probe': number;
};

export const DefaultPersistCache: PersistCacheSchema = {
  'internal.persist_probe': 0,
};

// ============================================================================
// Cache Key Types
// ============================================================================

/**
 * Key type for persist cache (fixed keys only)
 */
export type PersistCacheKey = keyof PersistCacheSchema;

/**
 * Key type for memory cache (supports both fixed and template keys).
 *
 * This type expands all schema keys using ProcessKey, which:
 * - Keeps fixed keys unchanged (e.g., 'app.path.resources')
 * - Expands template keys to match patterns (e.g., 'scroll.position.${id}' -> `scroll.position.${string}`)
 *
 * The resulting union type allows TypeScript to accept any concrete key
 * that matches either a fixed key or an expanded template pattern.
 */
export type UseCacheKey = {
  [K in keyof UseCacheSchema]: ProcessKey<K & string>;
}[keyof UseCacheSchema];

/**
 * Infers the value type for a given cache key from UseCacheSchema.
 *
 * Works with both fixed keys and template keys:
 * - For fixed keys, returns the exact value type from schema
 * - For template keys, matches the key against expanded patterns and returns the value type
 *
 * If the key doesn't match any schema entry, returns `never`.
 *
 * @example
 * ```typescript
 * type T1 = InferUseCacheValue<'settings.provider.openai.last_used_key_id'>  // string
 * type T2 = InferUseCacheValue<'unknown.key'>                                // never
 * ```
 */
export type InferUseCacheValue<K extends string> = {
  [S in keyof UseCacheSchema]: K extends ProcessKey<S & string> ? UseCacheSchema[S] : never;
}[keyof UseCacheSchema];

/**
 * Type guard for casual cache keys that blocks schema-defined keys.
 *
 * Used to ensure casual API methods (getCasual, setCasual, etc.) cannot
 * be called with keys that are defined in the schema (including template patterns).
 * This enforces proper API usage: use type-safe methods for schema keys,
 * use casual methods only for truly dynamic/unknown keys.
 *
 * Known limitation (inherited from desktop): this only bites on literal string
 * arguments — variable keys widen to `string` and pass through unchecked. The
 * runtime `templateToRegex` matching is the real gate.
 *
 * @template K - The key to check
 * @returns `K` if the key doesn't match any schema pattern, `never` if it does
 */
export type UseCacheCasualKey<K extends string> = K extends UseCacheKey ? never : K;
