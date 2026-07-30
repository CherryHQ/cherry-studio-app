/**
 * Cache types and interfaces for CacheService.
 *
 * Mobile runs a single JS runtime, so the desktop three-tier architecture
 * (memory / shared-over-IPC / persist) collapses into two tiers here:
 * 1. Memory cache (cross-component, TTL-capable, lost on app restart)
 * 2. Persist cache (survives restarts, backed by a synchronous KV store)
 */

/**
 * Cache entry with optional TTL support
 */
export interface CacheEntry<T = any> {
  value: T;
  /** Absolute expiration timestamp (ms since epoch) */
  expireAt?: number;
}

/**
 * Cache subscription callback
 */
export type CacheSubscriber = () => void;

// ============ Cache Statistics Types ============

/**
 * Summary statistics for a single cache tier
 */
export interface CacheTierSummary {
  /** Total number of entries in this tier */
  totalCount: number;
  /** Number of valid (non-expired) entries */
  validCount: number;
  /** Number of expired entries (lazy cleanup pending) */
  expiredCount: number;
  /** Number of entries with TTL configured */
  withTTLCount: number;
  /** Total hook reference count for this tier */
  hookReferences: number;
  /** Estimated memory size in bytes (rough estimate via JSON serialization) */
  estimatedBytes: number;
}

/**
 * Detailed information for a single cache entry
 */
export interface CacheEntryDetail {
  /** Cache key */
  key: string;
  /** Whether the entry has a value */
  hasValue: boolean;
  /** Whether TTL is configured */
  hasTTL: boolean;
  /** Whether the entry is expired */
  isExpired: boolean;
  /** Absolute expiration timestamp (ms since epoch) */
  expireAt?: number;
  /** Remaining time until expiration (ms), undefined if no TTL */
  remainingTTL?: number;
  /** Number of hooks currently referencing this key */
  hookCount: number;
}

/**
 * Complete cache statistics
 */
export interface CacheStats {
  /** Timestamp when stats were collected */
  collectedAt: number;

  /** Summary statistics */
  summary: {
    memory: CacheTierSummary;
    persist: CacheTierSummary;
    /** Aggregated totals across all tiers */
    total: {
      totalCount: number;
      validCount: number;
      expiredCount: number;
      withTTLCount: number;
      hookReferences: number;
      /** Total estimated memory in bytes */
      estimatedBytes: number;
      /** Human-readable memory size (e.g., "1.5 KB", "2.3 MB") */
      estimatedSize: string;
    };
  };

  /** Detailed per-entry information (optional, for debugging) */
  details: {
    memory: CacheEntryDetail[];
    persist: CacheEntryDetail[];
  };
}
