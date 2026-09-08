import type { AiUsageRecordEntry } from '@/shared/data/types/aiUsageRecord';
import type { MessageRuntimeTiming, MessageStats } from '@/shared/data/types/message';

function knownCount(value: number | null | undefined): number | undefined {
  return value != null && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function getMessageTokenUsage(stats: MessageStats | undefined) {
  return {
    inputTokens: knownCount(stats?.inputTokens),
    outputTokens: knownCount(stats?.outputTokens),
    totalTokens: knownCount(stats?.totalTokens),
  };
}

export function getMessageDurationMs(stats: MessageStats | undefined): number | undefined {
  const timing = stats?.runtimeTiming;
  return timing?.completedAt === undefined
    ? undefined
    : knownCount(timing.completedAt - timing.startedAt);
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

export function getMessageUsageDetails(
  stats: MessageStats | undefined,
  records: readonly AiUsageRecordEntry[],
) {
  const tokens = getMessageTokenUsage(stats);
  const durationMs = getMessageDurationMs(stats);
  const firstInvocation = records.find(
    (record) => record.recordKind === 'invocation' && record.modality === 'language',
  );
  const firstTokenMs = knownCount(firstInvocation?.timeFirstTokenMs);
  const measuredOutput = knownCount(stats?.providerPerformance?.measuredOutputTokens);
  const generationMs = knownCount(stats?.providerPerformance?.generationDurationMs);
  const modelTokensPerSecond =
    measuredOutput !== undefined && generationMs !== undefined && generationMs > 0
      ? measuredOutput / (generationMs / 1000)
      : undefined;

  return {
    ...tokens,
    noCacheTokens: knownCount(stats?.inputTokenDetails?.noCacheTokens),
    cacheReadTokens: knownCount(stats?.inputTokenDetails?.cacheReadTokens),
    cacheWriteTokens: knownCount(stats?.inputTokenDetails?.cacheWriteTokens),
    reasoningTokens: knownCount(stats?.outputTokenDetails?.reasoningTokens),
    costs: stats?.costs ?? [],
    requestCount: stats?.requestCount,
    hasUnpricedRecords: (stats?.unpricedRequestCount ?? 0) > 0,
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
