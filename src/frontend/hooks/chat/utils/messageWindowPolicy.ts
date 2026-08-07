export const messageWindowPolicy = {
  initialFetchCount: 12,
  initialRenderCount: 4,
  olderFetchCount: 12,
  revealCount: 4,
  /**
   * Longer than the app-wide default because message freshness comes from
   * `invalidate-topic-messages` (emitted by `ChatRuntime` around every write), not from
   * refetch-on-mount. Reopening a topic is an infinite query, so a stale window refetches
   * *every page loaded so far* — a long, scrolled-back conversation costs one query per page.
   */
  staleTimeMs: 5 * 60_000,
} as const;
