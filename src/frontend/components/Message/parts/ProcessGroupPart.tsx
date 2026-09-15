import { MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { getMessageProcessDurationMs } from '@/frontend/utils/messageProcessDuration';
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
  const reasoningDurations = items.flatMap(({ part }) => {
    if (part.type !== 'reasoning') return [];
    const thinkingMs = readCherryMeta(part)?.thinkingMs;
    return thinkingMs === undefined ? [] : [thinkingMs];
  });
  const persistedDurationMs = getMessageProcessDurationMs(message.stats, reasoningDurations);
  const seconds = Math.max(1, Math.round((persistedDurationMs ?? 0) / 1000));
  const title = t('chat.process.duration', { seconds });

  return (
    <MessagePart.Process onDisclosureToggle={handleDisclosureToggle} state="complete" title={title}>
      {items.map(({ index, key, part }) => (
        <MessagePartRenderer
          isStreaming={false}
          isTextSelectionEnabled={isTextSelectionEnabled}
          key={key}
          messageId={message.id}
          messageParts={messageParts}
          part={part}
          renderMode={renderMode}
          resolvedText={citationText.get(index)}
        />
      ))}
    </MessagePart.Process>
  );
}
