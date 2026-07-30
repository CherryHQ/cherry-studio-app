import type { Message } from '@/shared/domain/message';

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

  return parts.map((part, index) => (
    <MessagePart
      isStreaming={message.status === 'pending'}
      key={getMessagePartKey(message, part, index)}
      part={part}
      renderMode={renderMode}
    />
  ));
}
