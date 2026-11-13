import { useQueries } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { readToolCitations, type ConversationMessage } from '@/frontend/appShell/conversation';
import { canReadToolCitations, type CitationSource } from '@/frontend/utils/messageCitations';

/** Source facts load independently of history admission and of opening a tool detail. */
export function useMessageCitationSources(messages: readonly ConversationMessage[], scope: string) {
  const tasks = messages.flatMap((message) => {
    const hasCitations = message.display.data.parts?.some(
      (part) => part.type === 'text' && part.text.includes('[cite:'),
    );
    return !hasCitations
      ? []
      : (message.tools ?? []).flatMap((tool) =>
          tool.state === 'completed' && tool.output && canReadToolCitations(tool.title)
            ? [{ messageId: message.key, tool }]
            : [],
        );
  });
  const results = useQueries({
    queries: tasks.map(({ messageId, tool }) => ({
      queryKey: [
        'conversation-resource',
        scope,
        messageId,
        tool.key,
        tool.input?.kind === 'deferred' ? tool.input.key : null,
        tool.output?.kind === 'deferred' ? tool.output.key : null,
        'citations',
      ],
      queryFn: ({ signal }: { signal: AbortSignal }) => readToolCitations(tool, signal),
      staleTime: Infinity,
      gcTime: 0,
      retry: false,
    })),
  });
  const [cache] = useState(() => ({
    rows: new WeakMap<
      ConversationMessage,
      { sources: readonly CitationSource[]; row: ConversationMessage }
    >(),
    messages: [] as readonly ConversationMessage[],
  }));
  return useMemo(() => {
    const byMessage = new Map<string, CitationSource[]>();
    tasks.forEach(({ messageId }, index) => {
      const sources = results[index].data;
      if (sources?.length)
        byMessage.set(messageId, [...(byMessage.get(messageId) ?? []), ...sources]);
    });
    const next = messages.map((message) => {
      const sources = byMessage.get(message.key);
      if (!sources?.length) return message;
      const cached = cache.rows.get(message);
      if (
        cached?.sources.length === sources.length &&
        cached.sources.every((source, index) => source === sources[index])
      )
        return cached.row;
      const row = {
        ...message,
        display: {
          ...message.display,
          data: { ...message.display.data, citationSources: sources },
        },
      };
      cache.rows.set(message, { sources, row });
      return row;
    });
    if (next.every((message, index) => message === messages[index])) return messages;
    if (
      cache.messages.length === next.length &&
      cache.messages.every((message, index) => message === next[index])
    )
      return cache.messages;
    cache.messages = next;
    return next;
  }, [messages, tasks, results, cache]);
}
