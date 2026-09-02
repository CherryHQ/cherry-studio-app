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
  const showSources =
    message.status !== 'pending' && parts.some((part) => part.type === 'source-url');

  return (
    <View className="gap-2">
      {process.length > 0 ? (
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
      ) : null}
      {body.map((item) => (
        <MessagePartRenderer
          isStreaming={message.status === 'pending'}
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
      {/* Last, so the files a turn produced are the closest thing to the end of
          the message and stay put as the answer above them streams in. */}
      {files.length > 0 ? <GeneratedFileStrip parts={files} /> : null}
    </View>
  );
}
