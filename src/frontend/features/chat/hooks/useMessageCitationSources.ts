import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

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
import type { CherryMessagePart } from '@/shared/data/types/message';

const EMPTY_PARTS: readonly CherryMessagePart[] = [];
const citationIdsCache = new WeakMap<readonly CherryMessagePart[], readonly string[]>();
const rowMemoCache = new WeakMap<
  ConversationMessage,
  { sources: readonly CitationSource[]; row: ConversationMessage }
>();

function readCachedCitationIds(parts: readonly CherryMessagePart[]): readonly string[] {
  let cached = citationIdsCache.get(parts);
  if (!cached) {
    cached = citationIds(parts);
    citationIdsCache.set(parts, cached);
  }
  return cached;
}

function areSourcesEqual(
  left: readonly CitationSource[],
  right: readonly CitationSource[],
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every(
    (item, index) =>
      item === right[index] ||
      (item.id === right[index].id &&
        item.title === right[index].title &&
        item.url === right[index].url &&
        item.content === right[index].content),
  );
}

/** Source facts load independently of history admission and of opening a tool detail. */
export function useMessageCitationSources(
  messages: readonly ConversationMessage[],
  scope: string,
  readCitations?: ConversationCitationReader,
  revision?: string,
) {
  const tasks = useMemo(() => {
    const lastCitation = messages.findLastIndex(
      (message) => readCachedCitationIds(message.display.data.parts ?? EMPTY_PARTS).length > 0,
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
        parts: message.display.data.parts ?? EMPTY_PARTS,
        sources: byMessage.get(message.key) ?? [],
      })),
    );
  }, [messages, tasks, results.sources]);
  const missing = useMemo(
    () =>
      messages.flatMap((message) => {
        const parts = message.display.data.parts ?? EMPTY_PARTS;
        const known = new Set([
          ...(loadedRegistry.get(message.key) ?? []).map((source) => source.id),
          ...parts.flatMap((part) => (part.type === 'source-url' ? [part.sourceId] : [])),
        ]);
        const ids = readCachedCitationIds(parts).filter((id) => !known.has(id));
        return ids.length ? [{ messageId: message.key, ids }] : [];
      }),
    [loadedRegistry, messages],
  );
  const history = useQueries({
    queries: missing.map(({ messageId, ids }) => ({
      queryKey: ['conversation-resource', scope, revision, messageId, 'earlier-citations', ids],
      queryFn: ({ signal }: { signal: AbortSignal }) => readCitations!(messageId, ids, signal),
      enabled: Boolean(readCitations) && !results.pending,
      staleTime: Infinity,
      gcTime: 0,
      retry: false,
    })),
    combine: (items) => items.map((item) => item.data),
  });
  const registry = useMemo(() => {
    const next = new Map(loadedRegistry);
    missing.forEach(({ messageId }, index) => {
      const sources = history[index];
      if (sources?.length) next.set(messageId, [...(next.get(messageId) ?? []), ...sources]);
    });
    return next;
  }, [history, loadedRegistry, missing]);
  return useMemo(() => {
    const next = messages.map((message) => {
      const sources = registry.get(message.key);
      if (!sources?.length) return message;
      const cached = rowMemoCache.get(message);
      if (cached && areSourcesEqual(cached.sources, sources)) return cached.row;
      const row: ConversationMessage = {
        ...message,
        display: {
          ...message.display,
          data: { ...message.display.data, citationSources: sources },
        },
      };
      rowMemoCache.set(message, { sources, row });
      return row;
    });
    return next.every((message, index) => message === messages[index]) ? messages : next;
  }, [messages, registry]);
}
