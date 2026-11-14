import { useQueries } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import {
  readToolCitations,
  type ConversationCitationReader,
  type ConversationMessage,
} from '@/frontend/appShell/conversation';
import {
  canReadToolCitations,
  citationIds,
  conversationCitationSources,
  type CitationSource,
} from '@/frontend/utils/messageCitations';

/** Source facts load independently of history admission and of opening a tool detail. */
export function useMessageCitationSources(
  messages: readonly ConversationMessage[],
  scope: string,
  readCitations?: ConversationCitationReader,
  revision?: string,
) {
  const tasks = useMemo(() => {
    const lastCitation = messages.findLastIndex(
      (message) => citationIds(message.display.data.parts ?? []).length > 0,
    );
    return messages
      .slice(0, lastCitation + 1)
      .flatMap((message) =>
        (message.tools ?? []).flatMap((tool) =>
          tool.state === 'completed' && tool.output && canReadToolCitations(tool.title)
            ? [{ messageId: message.key, tool }]
            : [],
        ),
      );
  }, [messages]);
  const results = useQueries({
    queries: tasks.map(({ messageId, tool }) => ({
      queryKey: [
        'conversation-resource',
        scope,
        revision,
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
    combine: (items) => ({
      sources: items.map((item) => item.data),
      pending: items.some((item) => item.isPending),
    }),
  });
  const loadedRegistry = useMemo(() => {
    const byMessage = new Map<string, CitationSource[]>();
    tasks.forEach(({ messageId }, index) => {
      const sources = results.sources[index];
      if (sources?.length)
        byMessage.set(messageId, [...(byMessage.get(messageId) ?? []), ...sources]);
    });
    return conversationCitationSources(
      messages.map((message) => ({
        id: message.key,
        parts: message.display.data.parts ?? [],
        sources: byMessage.get(message.key) ?? [],
      })),
    );
  }, [messages, tasks, results.sources]);
  const missing = messages.flatMap((message) => {
    const parts = message.display.data.parts ?? [];
    const known = new Set([
      ...(loadedRegistry.get(message.key) ?? []).map((source) => source.id),
      ...parts.flatMap((part) => (part.type === 'source-url' ? [part.sourceId] : [])),
    ]);
    const ids = citationIds(parts).filter((id) => !known.has(id));
    return ids.length ? [{ messageId: message.key, ids }] : [];
  });
  const history = useQueries({
    queries: missing.map(({ messageId, ids }) => ({
      queryKey: ['conversation-resource', scope, revision, messageId, 'earlier-citations', ids],
      queryFn: ({ signal }: { signal: AbortSignal }) => readCitations!(messageId, ids, signal),
      enabled: Boolean(readCitations) && !results.pending,
      staleTime: Infinity,
      gcTime: 0,
      retry: false,
    })),
  });
  const registry = new Map(loadedRegistry);
  missing.forEach(({ messageId }, index) => {
    const sources = history[index].data;
    if (sources?.length) registry.set(messageId, [...(registry.get(messageId) ?? []), ...sources]);
  });
  const [cache] = useState(() => ({
    rows: new WeakMap<
      ConversationMessage,
      { sources: readonly CitationSource[]; row: ConversationMessage }
    >(),
    messages: [] as readonly ConversationMessage[],
  }));
  const next = messages.map((message) => {
    const sources = registry.get(message.key);
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
}
