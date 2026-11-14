export function deriveContextUsage(
  capacity: number | undefined,
  tokens?: number,
  estimated = false,
) {
  if (capacity === undefined || !Number.isFinite(capacity) || capacity <= 0) return undefined;
  const used = tokens !== undefined && Number.isFinite(tokens) && tokens >= 0 ? tokens : undefined;
  const ratio = used === undefined ? undefined : used / capacity;
  return {
    capacity,
    used,
    estimated,
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

export function formatContextUsagePercent(
  ratio: number,
  language: string,
  estimated = false,
): string {
  const percent = new Intl.NumberFormat(language, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(ratio);
  return estimated ? `≈${percent}` : percent;
}
