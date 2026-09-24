/**
 * Mobile-owned cache key tables and the type machinery that keeps them safe.
 *
 * Keys follow `namespace.sub.key_name` — lowercase segments joined by dots,
 * with `${variable}` placeholders as literal segments in template keys
 * (`/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/`). Persisted MMKV key strings are
 * data on real devices: renaming a persist key strands its stored value.
 *
 * Division of labor vs. preferences: `PreferenceService` (SQLite) holds
 * user-visible configuration; the cache tiers hold recoverable runtime state.
 */

import type { ReasoningEffortOption } from '@cherrystudio/universal/types/aiSdk';

// ============================================================================
// Template Key Type Utilities
// ============================================================================

/** `true` when the key contains at least one `${...}` placeholder. */
export type IsTemplateKey<K extends string> = K extends `${string}\${${string}}${string}`
  ? true
  : false;

/**
 * Expands each `${variable}` placeholder to `string`, so concrete keys
 * (`scroll.position.topic123`) match their template pattern.
 */
export type ExpandTemplateKey<T extends string> =
  T extends `${infer Prefix}\${${string}}${infer Suffix}`
    ? `${Prefix}${string}${ExpandTemplateKey<Suffix>}`
    : T;

/** Expanded pattern for template keys; the key itself for fixed keys. */
export type ProcessKey<K extends string> = IsTemplateKey<K> extends true ? ExpandTemplateKey<K> : K;

// ============================================================================
// Memory Cache Schemas
// ============================================================================

export type ChatScrollAnchor = Readonly<{
  key: string;
  offset: number;
}> | null;

/**
 * Frontend memory cache schema (TTL-capable, lost on app restart).
 */
export type UseCacheSchema = {
  // Completion acknowledged by opening the Session, scoped to this app process.
  'chat.last_seen_turn.${sessionId}': string | null;
  // Per-Session reading anchor. `null` means follow the current live edge.
  'chat.scroll_anchor.${sessionId}': ChatScrollAnchor;
  // Template-key probe keeps the generic string-value path covered independently.
  'internal.memory_probe.${instanceId}': string;
};

// PascalCase kept verbatim from the desktop export of the same name (like
// DefaultPreferences in the preference domain) so schema entries port with
// zero rewrites — deliberate exception to the UPPER_SNAKE_CASE constant rule.
export const DefaultUseCache: UseCacheSchema = {
  'chat.last_seen_turn.${sessionId}': null,
  'chat.scroll_anchor.${sessionId}': null,
  'internal.memory_probe.${instanceId}': '',
};

/**
 * Backend memory cache schema. Unlike {@link UseCacheSchema}, misses remain
 * observable as `undefined`; entries are not initialized from defaults.
 */
export type BackendCacheSchema = {
  // Round-robin cursor for enabled provider API keys.
  'settings.provider.${providerId}.last_used_key_id': string;
};

// ============================================================================
// Persist Cache Schemas
// ============================================================================

/**
 * Persist cache schema (fixed keys only, no TTL). Values MUST be
 * JSON-serializable (no Date/Map/Set/undefined) and defaults must not be
 * `undefined` — the backing store round-trips every value through JSON.
 */
export type PersistCacheSchema = {
  'remote_agent.drafts': Record<string, string>;
  // Last composer effort per Agent; clearing the cache restores model defaults.
  'chat.reasoning_efforts': Record<string, ReasoningEffortOption>;
  // Persist-layer self-test key: exercises the typed persist API and round-trip
  // tests for the generic mechanism, independent of any real consumer.
  'internal.persist_probe': number;
};

export const DefaultPersistCache: PersistCacheSchema = {
  'remote_agent.drafts': {},
  'chat.reasoning_efforts': {},
  'internal.persist_probe': 0,
};

/**
 * Backend-owned persist cache schema, physically independent from the
 * frontend persist cache.
 */
export type BackendPersistCacheSchema = {
  // Local date (`YYYY-MM-DD`) of the last analytics activity ping, so cold starts
  // and foreground entries report at most once a day. Empty means never reported.
  'analytics.last_activity_date': string;
  'internal.persist_probe': number;
};

export const DefaultBackendPersistCache: BackendPersistCacheSchema = {
  'analytics.last_activity_date': '',
  'internal.persist_probe': 0,
};

// ============================================================================
// Cache Key Types
// ============================================================================

/** Key type for persist cache (fixed keys only). */
export type PersistCacheKey = keyof PersistCacheSchema;

/** Backend persist keys are fixed and backend-owned. */
export type BackendPersistCacheKey = keyof BackendPersistCacheSchema;

/** Frontend memory keys, including concrete instances of template entries. */
export type UseCacheKey = {
  [K in keyof UseCacheSchema]: ProcessKey<K & string>;
}[keyof UseCacheSchema];

/** Backend memory keys, including concrete instances of template entries. */
export type BackendCacheKey = {
  [K in keyof BackendCacheSchema]: ProcessKey<K & string>;
}[keyof BackendCacheSchema];

/** Resolves a concrete frontend memory key to its schema value (`never` on miss). */
export type InferUseCacheValue<K extends string> = {
  [S in keyof UseCacheSchema]: K extends ProcessKey<S & string> ? UseCacheSchema[S] : never;
}[keyof UseCacheSchema];

/** Resolves a concrete backend memory key to its schema value. */
export type InferBackendCacheValue<K extends string> = {
  [S in keyof BackendCacheSchema]: K extends ProcessKey<S & string> ? BackendCacheSchema[S] : never;
}[keyof BackendCacheSchema];
