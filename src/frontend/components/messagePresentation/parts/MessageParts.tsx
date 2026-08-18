import type { MessagePresentationItem } from '../types';
import { resolveMessageCitationText } from './citations';
import { MessagePartRenderer } from './MessagePartRenderer';

type MessagePartsProps = {
  message: MessagePresentationItem;
  renderMode?: MessagePartRenderMode;
};

export type MessagePartRenderMode = 'markdown' | 'plainText';

function getMessagePartKey(
  message: MessagePresentationItem,
  part: NonNullable<MessagePresentationItem['data']['parts']>[number],
  index: number,
) {
  return `${message.id}-${part.type}-${index}`;
}

export function MessageParts({ message, renderMode = 'markdown' }: MessagePartsProps) {
  const parts = message.data.parts;

  if (!parts?.length) {
    return null;
  }

  const citationText = resolveMessageCitationText(parts);

  return parts.map((part, index) => {
    const resolvedText = citationText.get(index);
    return (
      <MessagePartRenderer
        isStreaming={message.status === 'pending'}
        key={getMessagePartKey(message, part, index)}
        part={part}
        renderMode={renderMode}
        resolvedText={resolvedText}
      />
    );
  });
}
