import { View } from 'react-native';

import type { MessageListItem } from '../types';
import { resolveMessageCitationText } from './citations';
import { groupMessageParts } from './groupMessageParts';
import { MessageFileStrip } from './MessageFileStrip';
import { MessagePartRenderer } from './MessagePartRenderer';
import { SourceGroup } from './SourceGroup';

type MessagePartsProps = {
  isTextSelectionEnabled: boolean;
  message: MessageListItem;
  renderMode?: MessagePartRenderMode;
};

export type MessagePartRenderMode = 'markdown' | 'plainText';

function getMessagePartKey(
  message: MessageListItem,
  part: NonNullable<MessageListItem['data']['parts']>[number],
  index: number,
) {
  return `${message.id}-${part.type}-${index}`;
}

export function MessageParts({
  isTextSelectionEnabled,
  message,
  renderMode = 'markdown',
}: MessagePartsProps) {
  const parts = message.data.parts;

  if (!parts?.length) {
    return null;
  }

  const citationText = resolveMessageCitationText(parts);
  const groups = groupMessageParts(parts);
  const sourceParts = parts.filter((part) => part.type === 'source-url');

  return (
    <View className="gap-2">
      {groups.map((group) =>
        group.kind === 'files' ? (
          <MessageFileStrip key={`${message.id}-files-${group.index}`} parts={group.parts} />
        ) : (
          <MessagePartRenderer
            isStreaming={message.status === 'pending'}
            isTextSelectionEnabled={isTextSelectionEnabled}
            key={getMessagePartKey(message, group.part, group.index)}
            part={group.part}
            renderMode={renderMode}
            resolvedText={citationText.get(group.index)}
          />
        ),
      )}
      {sourceParts.length > 0 ? <SourceGroup parts={sourceParts} /> : null}
    </View>
  );
}
