import type { Message } from '@cherrystudio/universal/data/types/message';

import { resolveMessageCitationText } from '../citations';
import { MessagePart } from './MessagePart';

type MessagePartsProps = {
  message: Message;
  renderMode?: MessagePartRenderMode;
};

export type MessagePartRenderMode = 'markdown' | 'plainText';

function getMessagePartKey(
  message: Message,
  part: NonNullable<Message['data']['parts']>[number],
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
      <MessagePart
        isStreaming={message.status === 'pending'}
        key={getMessagePartKey(message, part, index)}
        part={part}
        renderMode={renderMode}
        resolvedText={resolvedText}
      />
    );
  });
}
