import type {
  MessageRuntimeSpan,
  MessageRuntimeStatsInput,
  MessageRuntimeTiming,
  MessageStats,
} from '@cherrystudio/shared/data/types/message';

function mergeRuntimeSpan(
  existing: MessageRuntimeSpan,
  incoming: MessageRuntimeSpan,
): MessageRuntimeSpan {
  if (existing.kind !== incoming.kind) return existing;

  const completedAt =
    existing.completedAt !== undefined && incoming.completedAt !== undefined
      ? Math.max(existing.completedAt, incoming.completedAt)
      : (incoming.completedAt ?? existing.completedAt);

  return {
    ...existing,
    ...incoming,
    startedAt: Math.min(existing.startedAt, incoming.startedAt),
    ...(completedAt !== undefined ? { completedAt } : {}),
  } as MessageRuntimeSpan;
}

function mergeMessageRuntimeTiming(
  existing: MessageRuntimeTiming | undefined,
  incoming: MessageRuntimeTiming | undefined,
): MessageRuntimeTiming | undefined {
  if (!existing) return incoming;
  if (!incoming) return existing;

  const spans = new Map(existing.spans.map((span) => [span.id, span]));
  for (const span of incoming.spans) {
    const previous = spans.get(span.id);
    spans.set(span.id, previous ? mergeRuntimeSpan(previous, span) : span);
  }

  const completedAt =
    existing.completedAt !== undefined && incoming.completedAt !== undefined
      ? Math.max(existing.completedAt, incoming.completedAt)
      : (incoming.completedAt ?? existing.completedAt);

  return {
    startedAt: Math.min(existing.startedAt, incoming.startedAt),
    ...(completedAt !== undefined ? { completedAt } : {}),
    spans: [...spans.values()].sort(
      (left, right) => left.startedAt - right.startedAt || left.id.localeCompare(right.id),
    ),
  };
}

export function mergeMessageRuntimeStats(
  existing: MessageStats | null | undefined,
  incoming: MessageRuntimeStatsInput | null | undefined,
): MessageStats | undefined {
  const runtimeTiming = mergeMessageRuntimeTiming(existing?.runtimeTiming, incoming?.runtimeTiming);
  const merged: MessageStats = { ...existing };

  if (runtimeTiming) {
    merged.runtimeTiming = runtimeTiming;
    // `runtimeTiming` is the sole timing source for new-format messages.
    delete merged.timeFirstTokenMs;
    delete merged.timeCompletionMs;
    delete merged.timeThinkingMs;
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}
