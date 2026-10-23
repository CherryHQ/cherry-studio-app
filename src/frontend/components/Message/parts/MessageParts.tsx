import { ContextMenuExclusion, MessagePart } from '@cherrystudio/ui/components';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { usePdfOcrActive } from '@/frontend/hooks/file';
import { resolveMessageCitations } from '@/frontend/utils/messageCitations';
import { imageParamsAspectRatio } from '@/shared/utils/imageGenerationParams';

import type { MessageListItem } from '../types';
import { GeneratedFileStrip } from './GeneratedFileStrip';
import { GoogleSearchSuggestions } from './GoogleSearchSuggestions';
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
  const { t } = useTranslation();
  const parts = useMemo(
    () => omitGeneratedImageReferences(message.data.parts ?? []),
    [message.data.parts],
  );
  // Parts keep their identity across renders (see the projection cache), so the
  // resolved text and source-number map stay stable for their consumers too.
  const citations = useMemo(() => resolveMessageCitations(parts), [parts]);

  const { boundaries, body, files, process } = partitionMessageParts(parts);
  const isSettled = message.status !== 'pending';
  const isStreaming = !isSettled;
  const hasContent = boundaries.length > 0 || body.length > 0 || process.length > 0;
  // Initial connection feedback ends when the reply has visible content, including process.
  const isWaitingForResponse = message.role === 'assistant' && isStreaming && !hasContent;
  const isStoppedWithoutAnswer =
    message.role === 'assistant' &&
    message.status === 'paused' &&
    body.length === 0 &&
    files.length === 0;
  const showSources = isSettled && parts.some((part) => part.type === 'source-url');
  const initialImageAspectRatio = message.imageGeneration
    ? imageParamsAspectRatio(message.imageGeneration.paramValues)
    : undefined;

  return (
    <>
      {hasContent || (isSettled && parts.length > 0) ? (
        <View className="gap-4">
          {boundaries.map(({ index, part }) => (
            <MessagePartRenderer
              isStreaming={isStreaming}
              key={getMessagePartKey(message, part, index)}
              part={part}
            />
          ))}
          {process.length > 0 ? (
            <ContextMenuExclusion>
              <ProcessGroupPart
                key={message.id}
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
          ) : null}
          {body.map((item) =>
            item.part.type === 'file' ? (
              <GeneratedFileStrip
                initialImageAspectRatio={initialImageAspectRatio}
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
          {isSettled
            ? parts.flatMap((part, index) =>
                part.type === 'data-search-suggestions'
                  ? [
                      <GoogleSearchSuggestions
                        key={getMessagePartKey(message, part, index)}
                        html={part.data.html}
                      />,
                    ]
                  : [],
              )
            : null}
          {/* Downloadable files collect in the footer once the answer settles.
          Images stay in the body as soon as their file part arrives. */}
          {isSettled && files.length > 0 ? <GeneratedFileStrip parts={files} /> : null}
        </View>
      ) : null}
      {isWaitingForResponse ? (
        message.inputFileEntryIds ? (
          <PendingInputReply fileEntryIds={message.inputFileEntryIds} />
        ) : (
          <MessagePart.Pending accessibilityLabel={t('chat.message.waitingForResponse')} />
        )
      ) : null}
      {isStoppedWithoutAnswer ? (
        <MessagePart.Status testID="chat-message-stopped">
          <Text className="text-muted-foreground text-sm">{t('chat.message.stopped')}</Text>
        </MessagePart.Status>
      ) : null}
    </>
  );
}

/** Names local attachment work, such as scan recognition, that delays the first token. */
function PendingInputReply({ fileEntryIds }: { fileEntryIds: readonly string[] }) {
  const { t } = useTranslation();
  const recognizing = usePdfOcrActive(fileEntryIds);
  return (
    <MessagePart.Pending
      accessibilityLabel={t('chat.message.waitingForResponse')}
      reason={recognizing ? t('chat.message.recognizingScan') : undefined}
    />
  );
}
