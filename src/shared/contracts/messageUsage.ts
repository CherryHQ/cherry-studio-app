/** Materialized message usage supplied by its execution owner. Missing values are unknown. */
export type MessageUsageSummary = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  noCacheTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  durationMs?: number;
  toolDurationMs?: number;
  approvalDurationMs?: number;
  firstTokenMs?: number;
  modelTokensPerSecond?: number;
  endToEndTokensPerSecond?: number;
  requestCount?: number;
  hasUnpricedRecords?: boolean;
  costs?: readonly {
    currency: string;
    amount: number;
    providerReportedRequestCount: number;
    computedRequestCount: number;
  }[];
};
