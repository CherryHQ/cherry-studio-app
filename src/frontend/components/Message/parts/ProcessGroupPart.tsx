import { MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import type { CherryMessagePart } from '@/shared/data/types/message';
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
  const startedAt = parseTimestamp(message.createdAt);
  const endedAt = parseTimestamp(message.updatedAt);
  if (startedAt !== undefined && endedAt !== undefined && endedAt >= startedAt) {
    return endedAt - startedAt;
  }

  const reasoningDurations = items.flatMap(({ part }) => {
    if (part.type !== 'reasoning') return [];
    const thinkingMs = readCherryMeta(part)?.thinkingMs;
    return thinkingMs === undefined ? [] : [thinkingMs];
  });
  return reasoningDurations.length > 0 ? Math.max(...reasoningDurations) : undefined;
}

function parseTimestamp(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}
