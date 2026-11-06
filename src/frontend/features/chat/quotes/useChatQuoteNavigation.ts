import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useApiClient } from '@/frontend/data';
import { DataApiError, ErrorCode } from '@/shared/data/api/errors';

import { useAgentChatClient } from '../runtime/ChatProvider';
import type { MessageNavigation } from '../runtime/useAgentMessageHistoryWindow';
import { completeChatQuoteSource, readChatQuoteSource } from './chatQuoteSource';

export type QuoteNavigationOutcome =
  | { state: 'restored'; messageId: string; requestId: string }
  | { state: 'unavailable' }
  | { state: 'retryable'; reason: 'read-failed' | 'branch-changed' | 'scroll-failed' }
  | { state: 'cancelled' };
type Request = {
  sessionId: string;
  sourceMessageId: string;
  requestId: string;
  windowId: string;
  controller: AbortController;
  resolve: (outcome: QuoteNavigationOutcome) => void;
};

/** Exact windows are verified before becoming visible; only the list can confirm restoration. */
export function useChatQuoteNavigation(sessionId?: string, routeRequestId?: string) {
  const api = useApiClient();
  const { client } = useAgentChatClient();
  const sequence = useRef(0);
  const pending = useRef<Request | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const currentScope = useRef(sessionId);
  const [navigation, setNavigation] = useState<MessageNavigation>();
  const [highlight, setHighlight] = useState<string>();
  const cancelWork = useCallback(() => {
    pending.current?.controller.abort();
    pending.current?.resolve({ state: 'cancelled' });
    pending.current = undefined;
    clearTimeout(timer.current);
  }, []);
  const cancel = useCallback(() => {
    cancelWork();
    setHighlight(undefined);
  }, [cancelWork]);
  const scopeKey = JSON.stringify([sessionId, routeRequestId]);
  const [scope, setScope] = useState(scopeKey);
  if (scope !== scopeKey) {
    setScope(scopeKey);
    setNavigation(undefined);
    setHighlight(undefined);
  }
  useLayoutEffect(() => {
    currentScope.current = sessionId;
    cancelWork();
    return cancelWork;
  }, [cancelWork, sessionId, routeRequestId]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const openQuote = useCallback(
    (input: { sourceMessageId: string; requestId: string }): Promise<QuoteNavigationOutcome> => {
      cancel();
      if (!sessionId) return Promise.resolve({ state: 'unavailable' });
      return new Promise((resolve) => {
        const request: Request = {
          ...input,
          windowId: `${input.requestId}:${++sequence.current}`,
          sessionId,
          controller: new AbortController(),
          resolve,
        };
        pending.current = request;
        const active = () =>
          pending.current === request &&
          currentScope.current === sessionId &&
          !request.controller.signal.aborted;
        const finish = (outcome: QuoteNavigationOutcome) => {
          if (!active()) return;
          pending.current = undefined;
          resolve(outcome);
        };
        const lookup = () =>
          readChatQuoteSource(
            api,
            client,
            sessionId,
            input.sourceMessageId,
            request.controller.signal,
          );
        void (async () => {
          try {
            const source = await lookup();
            if (!active()) return;
            if (!source) return finish({ state: 'unavailable' });
            await client.selectMessage(sessionId, source.id);
            if (!active()) return;
            const page = await api.get(`/agent-sessions/${sessionId}/messages`, {
              query: { aroundMessageId: source.id, aroundMode: 'exact', limit: 50 },
              signal: request.controller.signal,
            });
            if (!active()) return;
            if (!page.items.some((item) => item.id === source.id)) {
              const fresh = await lookup();
              return finish(
                fresh ? { state: 'retryable', reason: 'branch-changed' } : { state: 'unavailable' },
              );
            }
            const exactSource = completeChatQuoteSource(
              page.items.find((item) => item.id === source.id),
              client,
              sessionId,
            );
            if (!exactSource) return finish({ state: 'unavailable' });
            setNavigation({
              messageId: source.id,
              messageRequestId: request.windowId,
              aroundMode: 'exact',
              preparedPage: {
                ...page,
                items: page.items.map((item) => (item.id === exactSource.id ? exactSource : item)),
              },
            });
          } catch (error) {
            if (!active()) return;
            if (error instanceof DataApiError && error.code === ErrorCode.NOT_FOUND) {
              try {
                const fresh = await lookup();
                finish(
                  fresh
                    ? { state: 'retryable', reason: 'branch-changed' }
                    : { state: 'unavailable' },
                );
              } catch {
                finish({ state: 'retryable', reason: 'read-failed' });
              }
            } else finish({ state: 'retryable', reason: 'read-failed' });
          }
        })();
      });
    },
    [api, cancel, client, sessionId],
  );
  const onTargetRestored = useCallback((target: { dataKey: string; messageId: string }) => {
    const request = pending.current;
    if (
      !request ||
      request.sessionId !== currentScope.current ||
      request.sourceMessageId !== target.messageId
    )
      return;
    const key = JSON.stringify([
      request.sessionId,
      request.sourceMessageId,
      request.windowId,
      'exact',
    ]);
    if (target.dataKey !== `${key}:message`) return;
    pending.current = undefined;
    setHighlight(target.messageId);
    timer.current = setTimeout(() => setHighlight(undefined), 1_200);
    request.resolve({
      state: 'restored',
      messageId: target.messageId,
      requestId: request.requestId,
    });
  }, []);
  const onReady = useCallback(() => {
    const request = pending.current;
    if (request && navigation?.messageRequestId === request.windowId) {
      pending.current = undefined;
      request.resolve({ state: 'retryable', reason: 'scroll-failed' });
    }
  }, [navigation?.messageRequestId]);
  return { navigation, highlight, openQuote, onTargetRestored, onReady, cancel };
}
