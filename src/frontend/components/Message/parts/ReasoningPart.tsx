import { ContentState, MessagePart } from '@cherrystudio/ui/components';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createContext, type PropsWithChildren, use, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MarkdownText } from '@/frontend/components/MarkdownText';
import { queryKeys, useBackendModule } from '@/frontend/data';
import type { AgentReadReasoningInput } from '@/shared/contracts/agent';
import type { CherryMessagePart } from '@/shared/data/types/message';
import { readCherryMeta } from '@/shared/data/types/uiParts';

import type { MessageListItem } from '../types';
import { findLatestActivityPart } from './partitionMessageParts';

const ReasoningDetailContext = createContext<((partId: string) => void) | null>(null);

/** Own the sheet above process folding, so settlement cannot interrupt an open reader. */
export function ReasoningDetailProvider({
  children,
  items,
  message,
}: PropsWithChildren<{
  items: readonly { key: string; part: CherryMessagePart }[];
  message: MessageListItem;
}>) {
  const { t } = useTranslation();
  const [openedPhase, setOpenedPhase] = useState<number>();
  const phases = useMemo(() => items.filter((item) => item.part.type === 'reasoning'), [items]);
  const openDetail = useCallback(
    (partId: string) => {
      const index = phases.findIndex((item) => item.key === partId);
      if (index >= 0) setOpenedPhase(index);
    },
    [phases],
  );
  // A streamed part receives its committed ID on settlement; its phase position stays the same.
  const selected = openedPhase === undefined ? undefined : phases[openedPhase];
  const part = selected?.part.type === 'reasoning' ? selected.part : undefined;
  const isThinking =
    message.status === 'pending' &&
    part?.state === 'streaming' &&
    part === findLatestActivityPart(message.data.parts ?? []);

  return (
    <ReasoningDetailContext value={openDetail}>
      {children}
      {selected && part ? (
        <MessagePart.Detail
          onClose={() => setOpenedPhase(undefined)}
          testID="reasoning-detail"
          title={t('chat.reasoningDetail.title')}
        >
          {message.agentSessionId ? (
            <LocalReasoningContent
              key={`${message.agentSessionId}:${message.id}:${openedPhase}`}
              isStreaming={isThinking}
              source={{
                sessionId: message.agentSessionId,
                messageId: message.id,
                partId: selected.key,
              }}
            />
          ) : (
            <ReasoningText isStreaming={isThinking} text={part.text} />
          )}
        </MessagePart.Detail>
      ) : null}
    </ReasoningDetailContext>
  );
}

type ReasoningPartProps = {
  isStreaming: boolean;
  part: Extract<CherryMessagePart, { type: 'reasoning' }>;
  source?: AgentReadReasoningInput;
  partId?: string;
};

export function ReasoningPart({ isStreaming, part, source, partId }: ReasoningPartProps) {
  const { t } = useTranslation();
  const openDetail = use(ReasoningDetailContext);
  const isThinking = isStreaming && part.state === 'streaming';
  const statusText = t(
    isThinking ? 'chat.reasoningStatus.thinking' : 'chat.reasoningStatus.thought',
  );

  // Local lists omit text; keep completed phases reachable through their content marker.
  if (!part.text && !isThinking && !readCherryMeta(part)?.hasText) {
    return null;
  }

  if (openDetail && partId) {
    return (
      <MessagePart.Summary
        onPress={() => openDetail(partId)}
        state={isThinking ? 'running' : 'complete'}
        testID="reasoning"
        title={statusText}
      />
    );
  }

  return (
    <MessagePart.Reasoning
      detailTitle={t('chat.reasoningDetail.title')}
      state={isThinking ? 'running' : 'complete'}
      statusText={statusText}
    >
      {source ? (
        <LocalReasoningContent
          key={`${source.sessionId}:${source.messageId}:${source.partId}`}
          isStreaming={isThinking}
          source={source}
        />
      ) : (
        <ReasoningText isStreaming={isThinking} text={part.text} />
      )}
    </MessagePart.Reasoning>
  );
}

/** Mounted only inside the open sheet; full text never joins observations or paged history. */
function LocalReasoningContent({
  isStreaming,
  source,
}: {
  isStreaming: boolean;
  source: AgentReadReasoningInput;
}) {
  const { t } = useTranslation();
  const agent = useBackendModule('agent');
  const result = useQuery({
    queryKey: [
      ...queryKeys.agentSessions.messages(source.sessionId),
      { reasoning: source.partId, messageId: source.messageId, isStreaming },
    ],
    queryFn: async ({ signal }) => {
      signal.throwIfAborted();
      const detail = await agent.readReasoning(source);
      signal.throwIfAborted();
      return detail;
    },
    // The keyed content cannot retain another phase's text. Keep this phase visible on settlement.
    placeholderData: keepPreviousData,
    networkMode: 'always',
    gcTime: 0,
    staleTime: 0,
    refetchInterval: isStreaming ? 1000 : false,
  });

  return (
    <>
      {result.isError ? (
        <ContentState.Error
          title={t('chat.reasoningDetail.loadFailed')}
          primaryAction={{ children: t('common.retry'), onPress: () => void result.refetch() }}
        />
      ) : null}
      {result.data ? (
        <ReasoningText
          isStreaming={isStreaming && result.data.state === 'streaming'}
          text={result.data.text}
        />
      ) : !result.isError ? (
        <ContentState.Loading title={t('chat.reasoningDetail.loading')} />
      ) : null}
    </>
  );
}

function ReasoningText({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  const { t } = useTranslation();
  // Sheet visibility, rather than the chat list's live-tail visibility, owns this reader.
  return text ? (
    <MarkdownText isStreaming={isStreaming} markdown={text} />
  ) : (
    <ContentState.Loading title={t('chat.reasoningStatus.thinking')} />
  );
}
