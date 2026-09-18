import { MessagePart } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { getMessageProcessDurationMs } from '@/frontend/utils/messageProcessDuration';
import type { CherryMessagePart } from '@/shared/data/types/message';
import { readCherryMeta } from '@/shared/data/types/uiParts';

import { useMessageListDisclosureToggle } from '../list/MessageListDisclosureContext';
import type { MessageListItem } from '../types';
import type { ResolvedCitationText } from './citations';
import { MessagePartRenderer } from './MessagePartRenderer';
import type { MessagePartRenderMode } from './MessageParts';
import { groupMessageProcessItems, type MessageProcessItem } from './partitionMessageParts';
import { ToolGroupPart } from './tools/ToolGroupPart';
import {
  deriveToolGroupSummary,
  getToolGroupStatusText,
  isToolMessagePart,
} from './tools/toolPartState';

type ProcessGroupItem = MessageProcessItem & { key: string };

type ProcessGroupPartProps = {
  citationText: ReadonlyMap<number, ResolvedCitationText>;
  items: readonly ProcessGroupItem[];
  message: MessageListItem;
  messageParts: readonly CherryMessagePart[];
  renderMode: MessagePartRenderMode;
};

export function ProcessGroupPart({
  citationText,
  items,
  message,
  messageParts,
  renderMode,
}: ProcessGroupPartProps) {
  const { t } = useTranslation();
  const handleDisclosureToggle = useMessageListDisclosureToggle();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const isStreaming = message.status === 'pending';
  const groups = groupMessageProcessItems(items);
  const tools = items.map(({ part }) => part).filter(isToolMessagePart);
  const summary = deriveToolGroupSummary(tools);
  const latestActivityPart = messageParts.findLast(
    (part) => part.type === 'text' || part.type === 'reasoning' || isToolMessagePart(part),
  );
  const reasoningDurations = items.flatMap(({ part }) => {
    if (part.type !== 'reasoning') return [];
    const thinkingMs = readCherryMeta(part)?.thinkingMs;
    return thinkingMs === undefined ? [] : [thinkingMs];
  });
  const persistedDurationMs = getMessageProcessDurationMs(message.stats, reasoningDurations);
  const seconds = Math.max(1, Math.round((persistedDurationMs ?? 0) / 1000));
  const title =
    persistedDurationMs === undefined
      ? t('chat.process.title')
      : t('chat.process.duration', { seconds });

  const renderItem = ({ index, key, part }: ProcessGroupItem) => (
    <MessagePartRenderer
      isStreaming={isStreaming}
      key={key}
      messageId={message.id}
      messageParts={messageParts}
      part={part}
      renderMode={renderMode}
      resolvedText={citationText.get(index)}
    />
  );
  const content = groups.map((group) => {
    if (group.kind === 'part') return renderItem(group.item);
    const key = group.items[0].key;
    const lastPart = group.items.at(-1)?.part;
    const isThinking =
      lastPart === latestActivityPart &&
      lastPart?.type === 'reasoning' &&
      lastPart.state === 'streaming';
    return (
      <ToolGroupPart
        key={key}
        expanded={expandedGroups[key] ?? false}
        isStreaming={isStreaming}
        isThinking={isThinking}
        onExpandedChange={(expanded) =>
          setExpandedGroups((current) => ({ ...current, [key]: expanded }))
        }
        tools={group.tools}
      >
        {group.items.map(renderItem)}
      </ToolGroupPart>
    );
  });

  if (isStreaming) return <View className="gap-1">{content}</View>;

  return (
    <MessagePart.Process
      defaultExpanded={Object.values(expandedGroups).some(Boolean)}
      onDisclosureToggle={handleDisclosureToggle}
      state="complete"
      statusText={getToolGroupStatusText(summary, t)}
      statusTone={summary.tone}
      title={title}
    >
      {content}
    </MessagePart.Process>
  );
}
