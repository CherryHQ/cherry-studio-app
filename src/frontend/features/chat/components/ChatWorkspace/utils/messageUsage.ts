import {
  type AiUsageRecordEntry,
  getAiUsageRecordTotalTokens,
} from '@/shared/data/types/aiUsageRecord';
import type { MessageRuntimeTiming, MessageStats } from '@/shared/data/types/message';

function knownCount(value: number | null | undefined): number | undefined {
  return value != null && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function getMessageTokenUsage(stats: MessageStats | undefined) {
  const inputTokens = knownCount(stats?.inputTokens);
  const outputTokens = knownCount(stats?.outputTokens);
  const reportedTotal = knownCount(stats?.totalTokens);
  const componentTotal =
    inputTokens !== undefined && outputTokens !== undefined
      ? inputTokens + outputTokens
      : undefined;

  return {
    inputTokens,
    outputTokens,
    totalTokens:
      reportedTotal !== undefined && reportedTotal > 0
        ? reportedTotal
        : (componentTotal ?? reportedTotal),
  };
}

export function getMessageDurationMs(stats: MessageStats | undefined): number | undefined {
  const timing = stats?.runtimeTiming;
  return timing
    ? timing.completedAt === undefined
      ? undefined
      : knownCount(timing.completedAt - timing.startedAt)
    : knownCount(stats?.timeCompletionMs);
}

function spanDurationMs(
  timing: MessageRuntimeTiming | undefined,
  kind: 'tool-execution' | 'approval-wait',
) {
  if (timing?.completedAt === undefined) return undefined;
  const end = timing.completedAt;
  const intervals = timing.spans
    .filter((span) => span.kind === kind)
    .map((span) => ({
      start: Math.max(timing.startedAt, span.startedAt),
      end: Math.min(end, span.completedAt ?? end),
    }))
    .filter((span) => span.end > span.start)
    .sort((left, right) => left.start - right.start);
  if (!intervals.length) return undefined;

  let duration = 0;
  let previousEnd = timing.startedAt;
  for (const interval of intervals) {
    duration += Math.max(0, interval.end - Math.max(previousEnd, interval.start));
    previousEnd = Math.max(previousEnd, interval.end);
  }
  return duration;
}

function sumReportedTokens(
  records: readonly AiUsageRecordEntry[],
  read: (record: AiUsageRecordEntry) => number | null,
): number | undefined {
  let total: number | undefined;
  for (const record of records) {
    const value = knownCount(read(record));
    if (value !== undefined) total = (total ?? 0) + value;
  }
  return total;
}

/** Older messages predate the persisted usage projection; retain their ledger details. */
function getHistoricalUsageStats(records: readonly AiUsageRecordEntry[]): MessageStats {
  const costs = new Map<string, NonNullable<MessageStats['costs']>[number]>();
  for (const record of records) {
    if (record.cost === null || record.costCurrency === null || record.costSource === null) {
      continue;
    }
    const cost = costs.get(record.costCurrency) ?? {
      amount: 0,
      currency: record.costCurrency,
      computedRequestCount: 0,
      providerReportedRequestCount: 0,
    };
    cost.amount += record.cost;
    if (record.costSource === 'provider') cost.providerReportedRequestCount += record.requestCount;
    if (record.costSource === 'computed') cost.computedRequestCount += record.requestCount;
    costs.set(record.costCurrency, cost);
  }

  return {
    inputTokens: sumReportedTokens(records, (record) => record.inputTokens),
    outputTokens: sumReportedTokens(records, (record) => record.outputTokens),
    totalTokens: sumReportedTokens(records, getAiUsageRecordTotalTokens),
    inputTokenDetails: {
      noCacheTokens: sumReportedTokens(records, (record) => record.noCacheTokens),
      cacheReadTokens: sumReportedTokens(records, (record) => record.cacheReadTokens),
      cacheWriteTokens: sumReportedTokens(records, (record) => record.cacheWriteTokens),
    },
    outputTokenDetails: {
      reasoningTokens: sumReportedTokens(records, (record) => record.reasoningTokens),
    },
    requestCount: records.length
      ? records.reduce((sum, record) => sum + record.requestCount, 0)
      : undefined,
    estimatedRequestCount: records.reduce(
      (sum, record) => sum + (record.recordKind === 'legacy-aggregate' ? record.requestCount : 0),
      0,
    ),
    unpricedRequestCount: records.reduce(
      (sum, record) => sum + (record.cost === null ? record.requestCount : 0),
      0,
    ),
    costs: [...costs.values()].sort((left, right) => left.currency.localeCompare(right.currency)),
  };
}

export function getMessageUsageDetails(
  stats: MessageStats | undefined,
  records: readonly AiUsageRecordEntry[],
) {
  // Match the Session store's marker: a persisted projection is one authoritative snapshot.
  const usageStats =
    stats?.requestCount !== undefined ? stats : { ...getHistoricalUsageStats(records), ...stats };
  const tokens = getMessageTokenUsage(usageStats);
  const durationMs = getMessageDurationMs(stats);
  const firstInvocation = records.find(
    (record) => record.recordKind === 'invocation' && record.modality === 'language',
  );
  const firstTokenMs = knownCount(stats?.timeFirstTokenMs ?? firstInvocation?.timeFirstTokenMs);
  const measuredOutput = knownCount(stats?.providerPerformance?.measuredOutputTokens);
  const generationMs = knownCount(stats?.providerPerformance?.generationDurationMs);
  const modelTokensPerSecond =
    measuredOutput !== undefined && generationMs !== undefined && generationMs > 0
      ? measuredOutput / (generationMs / 1000)
      : undefined;

  return {
    ...tokens,
    noCacheTokens: knownCount(usageStats.inputTokenDetails?.noCacheTokens),
    cacheReadTokens: knownCount(usageStats.inputTokenDetails?.cacheReadTokens),
    cacheWriteTokens: knownCount(usageStats.inputTokenDetails?.cacheWriteTokens),
    reasoningTokens: knownCount(usageStats.outputTokenDetails?.reasoningTokens),
    costs: usageStats.costs ?? [],
    requestCount: usageStats.requestCount,
    estimatedRequestCount: usageStats.estimatedRequestCount,
    hasUnpricedRecords: (usageStats.unpricedRequestCount ?? 0) > 0,
    durationMs,
    firstTokenMs,
    modelTokensPerSecond,
    endToEndTokensPerSecond:
      tokens.outputTokens !== undefined && durationMs !== undefined && durationMs > 0
        ? tokens.outputTokens / (durationMs / 1000)
        : undefined,
    toolDurationMs: spanDurationMs(stats?.runtimeTiming, 'tool-execution'),
    approvalDurationMs: spanDurationMs(stats?.runtimeTiming, 'approval-wait'),
  };
}

export function formatMessageUsageCost(amount: number, currency: string, locale: string): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 4,
  });
  return amount > 0 && amount < 0.0001 ? `<${formatter.format(0.0001)}` : formatter.format(amount);
}
