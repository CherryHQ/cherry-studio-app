import { View } from 'react-native';

import type { MessageListItem } from '../types';
import { resolveMessageCitationText } from './citations';
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
  const sourceParts = parts.filter((part) => part.type === 'source-url');

  return (
    <View className="gap-2">
      {parts.map((part, index) => {
        if (part.type === 'source-url') {
          return null;
        }

        const resolvedText = citationText.get(index);
        return (
          <MessagePartRenderer
            isStreaming={message.status === 'pending'}
            isTextSelectionEnabled={isTextSelectionEnabled}
            key={getMessagePartKey(message, part, index)}
            part={part}
            renderMode={renderMode}
            resolvedText={resolvedText}
          />
        );
      })}
      {sourceParts.length > 0 ? <SourceGroup parts={sourceParts} /> : null}
    </View>
  );
}
