import { ContextMenuExclusion } from '@cherrystudio/ui/components';
import { useMemo } from 'react';
import { View } from 'react-native';

import type { MessageListItem } from '../types';
import { resolveMessageCitations } from './citations';
import { GeneratedFileStrip } from './GeneratedFileStrip';
import { MessagePartRenderer } from './MessagePartRenderer';
import { omitGeneratedImageReferences } from './omitGeneratedImageReferences';
import { partitionMessageParts } from './partitionMessageParts';
import { ProcessGroupPart } from './ProcessGroupPart';
import { SourceGroup } from './SourceGroup';

type MessagePartsProps = {
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

export function MessageParts({ message, renderMode = 'markdown' }: MessagePartsProps) {
  const parts = useMemo(
    () => omitGeneratedImageReferences(message.data.parts ?? []),
    [message.data.parts],
  );
  // Parts keep their identity across renders (see the projection cache), so the
  // resolved text and source-number map stay stable for their consumers too.
  const citations = useMemo(() => resolveMessageCitations(parts), [parts]);

  if (!parts.length) {
    return null;
  }

  const { boundaries, body, files, process } = partitionMessageParts(parts);
  const isSettled = message.status !== 'pending';
  const isStreaming = !isSettled;
  const showSources = isSettled && parts.some((part) => part.type === 'source-url');

  return (
    <View className="gap-4">
      {boundaries.map(({ index, part }) => (
        <MessagePartRenderer
          isStreaming={isStreaming}
          key={getMessagePartKey(message, part, index)}
          part={part}
        />
      ))}
      {process.length > 0 ? (
        isStreaming ? (
          <View className="gap-1">
            {process.map(({ index, part }) => (
              <MessagePartRenderer
                isStreaming
                key={getMessagePartKey(message, part, index)}
                messageId={message.id}
                messageParts={parts}
                part={part}
                renderMode={renderMode}
                resolvedText={citations.textByPartIndex.get(index)}
              />
            ))}
          </View>
        ) : (
          <ContextMenuExclusion>
            <ProcessGroupPart
              citationText={citations.textByPartIndex}
              items={process.map(({ index, part }) => ({
                index,
                key: getMessagePartKey(message, part, index),
                part,
              }))}
              message={message}
              messageParts={parts}
              renderMode={renderMode}
            />
          </ContextMenuExclusion>
        )
      ) : null}
      {body.map((item) =>
        item.part.type === 'file' ? (
          <GeneratedFileStrip
            key={getMessagePartKey(message, item.part, item.index)}
            parts={[item.part]}
          />
        ) : (
          <MessagePartRenderer
            isStreaming={isStreaming}
            key={getMessagePartKey(message, item.part, item.index)}
            messageId={message.id}
            messageParts={parts}
            part={item.part}
            renderMode={renderMode}
            resolvedText={citations.textByPartIndex.get(item.index)}
          />
        ),
      )}
      {showSources ? (
        <SourceGroup citationNumberBySourceId={citations.sourceNumberById} parts={parts} />
      ) : null}
      {/* Downloadable files collect in the footer once the answer settles.
          Images stay in the body as soon as their file part arrives. */}
      {isSettled && files.length > 0 ? <GeneratedFileStrip parts={files} /> : null}
    </View>
  );
}
