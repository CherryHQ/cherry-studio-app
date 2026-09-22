import { v7 as uuidv7 } from 'uuid';

import { messageWindowPolicy } from '@/frontend/hooks/chat/utils/messageWindowPolicy';
import type { AgentMessageView } from '@/shared/contracts/agent';
import type {
  AgentSessionMessagePage,
  ListAgentSessionMessagesQueryParams,
} from '@/shared/data/api/schemas/agentSessionMessages';
import type { ApiClient } from '@/shared/data/api/types';

import type {
  ConversationHistory,
  ConversationMessage,
  HistoryCursor,
  HistoryPage,
  HistoryVersion,
  MessageRef,
  QueryScope,
} from '../contracts';
import { createConversationReferences, ConversationReadError } from '../conversationState';
import { localConversationFailure } from './localConversationFailure';

export function localConversationHistory(input: {
  api: ApiClient;
  scope: QueryScope;
  sessionId: string;
  assertCurrent(signal: AbortSignal): void;
  project(message: AgentMessageView): ConversationMessage;
  reconcile(messages: readonly AgentMessageView[]): void;
}): ConversationHistory {
  const { api, scope, sessionId, assertCurrent, project } = input;
  const refs = createConversationReferences(scope, sessionId);
  async function read(query: ListAgentSessionMessagesQueryParams, signal: AbortSignal) {
    assertCurrent(signal);
    try {
      const page = await api.get(`/agent-sessions/${sessionId}/messages`, { query, signal });
      assertCurrent(signal);
      input.reconcile(page.items);
      return page;
    } catch (error) {
      throw new ConversationReadError(localConversationFailure(error));
    }
  }
  async function open(signal: AbortSignal, aroundMessageId?: string) {
    let disposed = false;
    const version = uuidv7() as HistoryVersion;
    const cursors = createConversationReferences(scope, `${sessionId}:${version}`);
    const check = (signal: AbortSignal) => {
      assertCurrent(signal);
      if (disposed) throw new ConversationReadError({ code: 'retired', retry: 'none' });
    };
    const page = (raw: AgentSessionMessagePage): HistoryPage => ({
      items: raw.items.toReversed().map(project),
      ...(raw.nextCursor ? { older: cursors.issue<HistoryCursor>('older', raw.nextCursor) } : {}),
      ...(raw.previousCursor
        ? { newer: cursors.issue<HistoryCursor>('newer', raw.previousCursor) }
        : {}),
    });
    const initial = page(
      await read({ aroundMessageId, limit: messageWindowPolicy.initialFetchCount }, signal),
    );
    return {
      scope,
      version,
      initial,
      read: async (cursor: HistoryCursor, signal: AbortSignal) => {
        check(signal);
        let direction: 'older' | 'newer' = 'older';
        let decoded: { id: string };
        try {
          decoded = cursors.resolve(cursor, direction);
        } catch {
          direction = 'newer';
          decoded = cursors.resolve(cursor, direction);
        }
        const result = await read(
          { cursor: decoded.id, direction, limit: messageWindowPolicy.olderFetchCount },
          signal,
        );
        check(signal);
        return page(result);
      },
      dispose: () => {
        disposed = true;
      },
    };
  }
  return {
    openLatest: (signal) => open(signal),
    openAround: (message, signal) => open(signal, refs.resolve(message, 'message').id),
    prepareSelection: async (messages: readonly MessageRef[], signal) => {
      assertCurrent(signal);
      const ids = messages.map((ref) => refs.resolve(ref, 'message').id);
      try {
        const snapshot = await api.get(`/agent-sessions/${sessionId}/messages/selection`, {
          query: { ids },
          signal,
        });
        assertCurrent(signal);
        return {
          title: snapshot.session.title,
          assistantName: snapshot.assistantName,
          messages: snapshot.messages,
          assets: [],
          release: () => {},
        };
      } catch (error) {
        throw new ConversationReadError(localConversationFailure(error));
      }
    },
  };
}
