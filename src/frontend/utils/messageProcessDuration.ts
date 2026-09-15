import type { MessageRuntimeTiming, MessageStats } from '@/shared/data/types/message';

/** Shared by the transcript and its export snapshot, including approval-wait exclusion. */
export function getMessageProcessDurationMs(
  stats: MessageStats | null | undefined,
  reasoningDurations: readonly number[] = [],
): number | undefined {
  const runtimeTiming = stats?.runtimeTiming;
  if (runtimeTiming?.completedAt !== undefined) {
    const wallClockMs = Math.max(0, runtimeTiming.completedAt - runtimeTiming.startedAt);
    return Math.max(0, wallClockMs - getApprovalWaitDurationMs(runtimeTiming));
  }
  if (typeof stats?.timeCompletionMs === 'number') {
    return stats.timeCompletionMs;
  }
  return reasoningDurations.length > 0 ? Math.max(...reasoningDurations) : undefined;
}

function getApprovalWaitDurationMs(runtimeTiming: MessageRuntimeTiming): number {
  const completedAt = runtimeTiming.completedAt;
  if (completedAt === undefined) return 0;

  const intervals = runtimeTiming.spans
    .filter((span) => span.kind === 'approval-wait')
    .map((span) => ({
      startedAt: Math.max(runtimeTiming.startedAt, span.startedAt),
      completedAt: Math.min(completedAt, span.completedAt ?? completedAt),
    }))
    .filter((span) => span.completedAt > span.startedAt)
    .sort((left, right) => left.startedAt - right.startedAt);

  let durationMs = 0;
  let mergedStart: number | undefined;
  let mergedEnd: number | undefined;
  for (const interval of intervals) {
    if (mergedStart === undefined || mergedEnd === undefined) {
      mergedStart = interval.startedAt;
      mergedEnd = interval.completedAt;
    } else if (interval.startedAt <= mergedEnd) {
      mergedEnd = Math.max(mergedEnd, interval.completedAt);
    } else {
      durationMs += mergedEnd - mergedStart;
      mergedStart = interval.startedAt;
      mergedEnd = interval.completedAt;
    }
  }
  if (mergedStart !== undefined && mergedEnd !== undefined) {
    durationMs += mergedEnd - mergedStart;
  }
  return durationMs;
}
