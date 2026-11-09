import type { MessageStats } from '@/shared/data/types/messageStats';

type InputDetails = MessageStats['inputTokenDetails'];

/** The denominator is the attributed all-in input, never a reconstruction from buckets. */
export function getCacheHitRate(inputTokens?: number, details?: InputDetails): number | undefined {
  const read = details?.cacheReadTokens;
  if (
    inputTokens === undefined ||
    !Number.isFinite(inputTokens) ||
    inputTokens <= 0 ||
    read === undefined
  )
    return undefined;
  const buckets = [details?.noCacheTokens, read, details?.cacheWriteTokens];
  if (buckets.some((value) => value !== undefined && (!Number.isFinite(value) || value < 0)))
    return undefined;
  const sum = buckets.reduce<number>((total, value) => total + (value ?? 0), 0);
  if (sum > inputTokens || (buckets.every((value) => value !== undefined) && sum !== inputTokens))
    return undefined;
  return read / inputTokens;
}

export function deriveContextUsage(
  capacity: number | undefined,
  stats?: Pick<MessageStats, 'contextTokens' | 'inputTokens' | 'inputTokenDetails'>,
) {
  if (capacity === undefined || !Number.isFinite(capacity) || capacity <= 0) return undefined;
  const measured = stats?.contextTokens;
  const used =
    measured !== undefined && Number.isFinite(measured) && measured > 0 ? measured : undefined;
  const ratio = used === undefined ? undefined : used / capacity;
  return {
    capacity,
    used,
    remaining: used === undefined ? undefined : Math.max(0, capacity - used),
    ratio,
    arcRatio: ratio === undefined ? undefined : Math.min(1, ratio),
    severity:
      ratio === undefined
        ? undefined
        : ratio >= 0.95
          ? 'error'
          : ratio >= 0.8
            ? 'warning'
            : 'primary',
    cache: stats?.inputTokenDetails,
    cacheHitRate: getCacheHitRate(stats?.inputTokens, stats?.inputTokenDetails),
  } as const;
}

export function formatContextUsagePercent(ratio: number, language: string): string {
  return new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 0 }).format(
    Math.floor(ratio * 100) / 100,
  );
}
