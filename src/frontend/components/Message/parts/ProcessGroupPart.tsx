import { MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import type { CherryMessagePart, MessageRuntimeTiming } from '@/shared/data/types/message';
import { readCherryMeta } from '@/shared/data/types/uiParts';

import { useMessageListDisclosureToggle } from '../list/MessageListDisclosureContext';
import type { MessageListItem } from '../types';
import type { ResolvedCitationText } from './citations';
import { MessagePartRenderer } from './MessagePartRenderer';
import type { MessagePartRenderMode } from './MessageParts';
import type { MessageProcessItem } from './partitionMessageParts';

type ProcessGroupItem = MessageProcessItem & { key: string };

type ProcessGroupPartProps = {
  citationText: ReadonlyMap<number, ResolvedCitationText>;
  isTextSelectionEnabled: boolean;
  items: readonly ProcessGroupItem[];
  message: MessageListItem;
  messageParts: readonly CherryMessagePart[];
  renderMode: MessagePartRenderMode;
};

export function ProcessGroupPart({
  citationText,
  isTextSelectionEnabled,
  items,
  message,
  messageParts,
  renderMode,
}: ProcessGroupPartProps) {
  const { t } = useTranslation();
  const handleDisclosureToggle = useMessageListDisclosureToggle();
  const persistedDurationMs = resolvePersistedDurationMs(message, items);
  const seconds = Math.max(1, Math.round((persistedDurationMs ?? 0) / 1000));
  const title = t('chat.process.duration', { seconds });

  return (
    <MessagePart.Process onDisclosureToggle={handleDisclosureToggle} state="complete" title={title}>
      {items.map(({ index, key, part }) => (
        <MessagePartRenderer
          isStreaming={false}
          isTextSelectionEnabled={isTextSelectionEnabled}
          key={key}
          messageParts={messageParts}
          part={part}
          renderMode={renderMode}
          resolvedText={citationText.get(index)}
        />
      ))}
    </MessagePart.Process>
  );
}

function resolvePersistedDurationMs(
  message: MessageListItem,
  items: readonly ProcessGroupItem[],
): number | undefined {
  const runtimeTiming = message.stats?.runtimeTiming;
  if (runtimeTiming?.completedAt !== undefined) {
    const wallClockMs = Math.max(0, runtimeTiming.completedAt - runtimeTiming.startedAt);
    return Math.max(0, wallClockMs - getApprovalWaitDurationMs(runtimeTiming));
  }
  if (typeof message.stats?.timeCompletionMs === 'number') {
    return message.stats.timeCompletionMs;
  }

  const reasoningDurations = items.flatMap(({ part }) => {
    if (part.type !== 'reasoning') return [];
    const thinkingMs = readCherryMeta(part)?.thinkingMs;
    return thinkingMs === undefined ? [] : [thinkingMs];
  });
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
