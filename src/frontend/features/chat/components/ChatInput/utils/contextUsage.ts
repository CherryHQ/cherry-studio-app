import type { MessageStats } from '@/shared/data/types/messageStats';

export function deriveContextUsage(
  capacity: number | undefined,
  stats?: Pick<MessageStats, 'contextTokens'>,
) {
  if (capacity === undefined || !Number.isFinite(capacity) || capacity <= 0) return undefined;
  const measured = stats?.contextTokens;
  const used =
    measured !== undefined && Number.isFinite(measured) && measured > 0 ? measured : undefined;
  const ratio = used === undefined ? undefined : used / capacity;
  return {
    capacity,
    used,
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
  } as const;
}

export type ContextUsage = NonNullable<ReturnType<typeof deriveContextUsage>>;

/** The capacity is always shown in thousands, including for million-token models. */
export function formatContextCapacity(capacity: number, language: string): string {
  return new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(capacity / 1000);
}

export function formatContextUsagePercent(ratio: number, language: string): string {
  return new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 0 }).format(
    Math.floor(ratio * 100) / 100,
  );
}
