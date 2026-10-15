import { ContextMenuExclusion, MessagePart } from '@cherrystudio/ui/components';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { CherryMessagePart } from '@/shared/data/types/message';
import { imageParamsAspectRatio } from '@/shared/utils/imageGenerationParams';

import type { MessageListItem } from '../types';
import { resolveMessageCitations } from './citations';
import { GeneratedFileStrip } from './GeneratedFileStrip';
import { GoogleSearchSuggestions } from './GoogleSearchSuggestions';
import { MessagePartRenderer } from './MessagePartRenderer';
import { omitGeneratedImageReferences } from './omitGeneratedImageReferences';
import {
  findLatestActivityPart,
  type MessageBodyItem,
  partitionMessageParts,
} from './partitionMessageParts';
import { ProcessGroupPart } from './ProcessGroupPart';
import { SourceGroup } from './SourceGroup';
import {
  getToolDisplayState,
  isProviderWebSearchToolPart,
  isToolMessagePart,
} from './tools/toolPartState';

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
  // Feedback uses the same normalized parts and layout as the rendered content.
  const isWaitingForResponse =
    message.role === 'assistant' && isStreaming && !showsLiveActivity(parts, body);
  const hasContent = boundaries.length > 0 || body.length > 0 || process.length > 0;
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
        <MessagePart.Pending accessibilityLabel={t('chat.message.waitingForResponse')} />
      ) : null}
    </>
  );
}

/**
 * Whether an unfinished reply already shows its own live feedback. Body parts render after the
 * process group, so process activity is hidden above any of them, such as an answered question.
 */
function showsLiveActivity(parts: readonly CherryMessagePart[], body: readonly MessageBodyItem[]) {
  const latestActivityPart = findLatestActivityPart(parts);
  const isAtBottom = (part: CherryMessagePart) =>
    body.length === 0 || body.some((item) => item.part === part);
  return parts.some((part) => {
    if (part.type === 'data-compaction-anchor') return part.data.status === 'compacting';
    if (isToolMessagePart(part)) {
      return (
        part.state === 'approval-requested' ||
        (!isProviderWebSearchToolPart(part) &&
          getToolDisplayState(part) === 'running' &&
          isAtBottom(part))
      );
    }
    return (
      part === latestActivityPart &&
      (part.type === 'text' || part.type === 'reasoning') &&
      part.state === 'streaming' &&
      (part.type === 'reasoning' || part.text.trim().length > 0) &&
      isAtBottom(part)
    );
  });
}
