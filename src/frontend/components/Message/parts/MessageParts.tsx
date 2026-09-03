import { useMemo } from 'react';
import { View } from 'react-native';

import type { MessageListItem } from '../types';
import { resolveMessageCitations } from './citations';
import { GeneratedFileStrip } from './GeneratedFileStrip';
import { MessagePartRenderer } from './MessagePartRenderer';
import { partitionMessageParts } from './partitionMessageParts';
import { ProcessGroupPart } from './ProcessGroupPart';
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
  // Parts keep their identity across renders (see the projection cache), so the
  // resolved text and source-number map stay stable for their consumers too.
  const citations = useMemo(() => resolveMessageCitations(parts ?? []), [parts]);

  if (!parts?.length) {
    return null;
  }

  const { body, files, process } = partitionMessageParts(parts);
  const isSettled = message.status !== 'pending';
  const isStreaming = !isSettled;
  const showSources = isSettled && parts.some((part) => part.type === 'source-url');

  return (
    <View className="gap-2">
      {process.length > 0 ? (
        isStreaming ? (
          process.map(({ index, part }) => (
            <MessagePartRenderer
              isStreaming
              isTextSelectionEnabled={isTextSelectionEnabled}
              key={getMessagePartKey(message, part, index)}
              messageParts={parts}
              part={part}
              renderMode={renderMode}
              resolvedText={citations.textByPartIndex.get(index)}
            />
          ))
        ) : (
          <ProcessGroupPart
            citationText={citations.textByPartIndex}
            isTextSelectionEnabled={isTextSelectionEnabled}
            items={process.map(({ index, part }) => ({
              index,
              key: getMessagePartKey(message, part, index),
              part,
            }))}
            message={message}
            messageParts={parts}
            renderMode={renderMode}
          />
        )
      ) : null}
      {body.map((item) => (
        <MessagePartRenderer
          isStreaming={isStreaming}
          isTextSelectionEnabled={isTextSelectionEnabled}
          key={getMessagePartKey(message, item.part, item.index)}
          messageParts={parts}
          part={item.part}
          renderMode={renderMode}
          resolvedText={citations.textByPartIndex.get(item.index)}
        />
      ))}
      {showSources ? (
        <SourceGroup citationNumberBySourceId={citations.sourceNumberById} parts={parts} />
      ) : null}
      {/* Like sources and message actions, generated results belong to the
          settled message footer. Hiding them while text streams prevents the
          list tail from repeatedly moving around a large card. */}
      {isSettled && files.length > 0 ? <GeneratedFileStrip parts={files} /> : null}
    </View>
  );
}
