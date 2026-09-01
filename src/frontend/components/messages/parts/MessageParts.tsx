import { useMemo } from 'react';
import { View } from 'react-native';

import type { MessageListItem } from '../types';
import { resolveMessageCitationText } from './citations';
import { MessageFileStrip } from './MessageFileStrip';
import { MessagePartRenderer } from './MessagePartRenderer';
import { partitionMessageParts } from './partitionMessageParts';
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
  return message.data.partKeys?.[index] ?? `${message.id}-${part.type}-${index}`;
}

export function MessageParts({
  isTextSelectionEnabled,
  message,
  renderMode = 'markdown',
}: MessagePartsProps) {
  const parts = message.data.parts;
  // Parts keep their identity across renders (see the projection cache), so this
  // has to be memoized: a fresh ResolvedCitationText per render would defeat the
  // memo on MessagePartRenderer for every message that carries citations.
  const citationText = useMemo(() => resolveMessageCitationText(parts ?? []), [parts]);

  if (!parts?.length) {
    return null;
  }

  const { body, files } = partitionMessageParts(parts);
  const hasSources = parts.some((part) => part.type === 'source-url');

  return (
    <View className="gap-2">
      {body.map(({ index, part }) => (
        <MessagePartRenderer
          isStreaming={message.status === 'pending'}
          isTextSelectionEnabled={isTextSelectionEnabled}
          key={getMessagePartKey(message, part, index)}
          messageParts={parts}
          part={part}
          renderMode={renderMode}
          resolvedText={citationText.get(index)}
        />
      ))}
      {hasSources ? <SourceGroup parts={parts} /> : null}
      {/* Last, so the files a turn produced are the closest thing to the end of
          the message and stay put as the answer above them streams in. */}
      {files.length > 0 ? <MessageFileStrip parts={files} /> : null}
    </View>
  );
}
