export const messageWindowPolicy = {
  initialFetchCount: 12,
  initialRenderCount: 4,
  olderFetchCount: 12,
  revealCount: 4,
  /** Avoid refetching every loaded history page when reopening a long session. */
  staleTimeMs: 5 * 60_000,
} as const;
