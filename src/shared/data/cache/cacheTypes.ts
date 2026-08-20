/** Cache entry shared by the independent frontend and backend cache implementations. */
export interface CacheEntry<T = unknown> {
  value: T;
  /** Absolute expiration timestamp in Unix milliseconds. */
  expireAt?: number;
}

/** Frontend cache subscription callback. */
export type CacheSubscriber = () => void;

/** Summary statistics for one frontend cache tier. */
export interface CacheTierSummary {
  totalCount: number;
  validCount: number;
  expiredCount: number;
  withTTLCount: number;
  hookReferences: number;
  estimatedBytes: number;
}

/** Debug information for one frontend cache entry. */
export interface CacheEntryDetail {
  key: string;
  hasValue: boolean;
  hasTTL: boolean;
  isExpired: boolean;
  expireAt?: number;
  remainingTTL?: number;
  hookCount: number;
}

/** Snapshot returned by the frontend CacheService diagnostics API. */
export interface CacheStats {
  collectedAt: number;
  summary: {
    memory: CacheTierSummary;
    persist: CacheTierSummary;
    total: {
      totalCount: number;
      validCount: number;
      expiredCount: number;
      withTTLCount: number;
      hookReferences: number;
      estimatedBytes: number;
      estimatedSize: string;
    };
  };
  details: {
    memory: CacheEntryDetail[];
    persist: CacheEntryDetail[];
  };
}
