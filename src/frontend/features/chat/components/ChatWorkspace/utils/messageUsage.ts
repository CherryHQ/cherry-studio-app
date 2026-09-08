import type { AiUsageRecordEntry } from '@/shared/data/types/aiUsageRecord';
import type { MessageRuntimeTiming, MessageStats } from '@/shared/data/types/message';
import type { Model } from '@/shared/data/types/model';

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
  model: Pick<Model, 'modelId' | 'providerId'> | undefined,
) {
  const tokens = getMessageTokenUsage(stats);
  const durationMs = getMessageDurationMs(stats);
  // The message's providerPerformance also includes image tools and other models.
  const modelInvocations = records.filter(
    (record) =>
      model !== undefined &&
      record.recordKind === 'invocation' &&
      record.modality === 'language' &&
      record.providerId === model.providerId &&
      record.modelId === model.modelId,
  );
  const firstTokenMs = knownCount(modelInvocations[0]?.timeFirstTokenMs);
  let measuredOutputTokens = 0;
  let generationDurationMs = 0;
  for (const invocation of modelInvocations) {
    const outputTokens = knownCount(invocation.outputTokens);
    const completionMs = knownCount(invocation.timeCompletionMs);
    if (outputTokens === undefined || completionMs === undefined || completionMs === 0) continue;

    const invocationFirstTokenMs = knownCount(invocation.timeFirstTokenMs);
    measuredOutputTokens += outputTokens;
    generationDurationMs +=
      invocationFirstTokenMs !== undefined && invocationFirstTokenMs < completionMs
        ? completionMs - invocationFirstTokenMs
        : completionMs;
  }

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
    modelTokensPerSecond:
      generationDurationMs > 0 ? measuredOutputTokens / (generationDurationMs / 1000) : undefined,
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
