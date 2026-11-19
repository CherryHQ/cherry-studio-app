import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import type { MessageListHandle } from '@/frontend/components/Message';
import { useApiClient } from '@/frontend/data';
import { useTransientValue } from '@/frontend/hooks/useTransientValue';
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
type InWindowTarget = {
  activeNodeId: string;
  scrollToMessage: MessageListHandle['scrollToMessage'];
};

/** Exact windows are verified before becoming visible; only the list can confirm restoration. */
export function useChatQuoteNavigation(sessionId?: string, routeRequestId?: string) {
  const api = useApiClient();
  const { client } = useAgentChatClient();
  const sequence = useRef(0);
  const pending = useRef<Request | undefined>(undefined);
  const currentScope = useRef(sessionId);
  const scopeKey = JSON.stringify([sessionId, routeRequestId]);
  const [navigation, setNavigation] = useState<MessageNavigation>();
  const {
    value: highlight,
    show: showHighlight,
    clear: clearHighlight,
  } = useTransientValue<string>(1_200, scopeKey);
  const cancelWork = useCallback(() => {
    pending.current?.controller.abort();
    pending.current?.resolve({ state: 'cancelled' });
    pending.current = undefined;
  }, []);
  const cancel = useCallback(() => {
    cancelWork();
    clearHighlight();
  }, [cancelWork, clearHighlight]);
  const [scope, setScope] = useState(scopeKey);
  if (scope !== scopeKey) {
    setScope(scopeKey);
    setNavigation(undefined);
  }
  useLayoutEffect(() => {
    currentScope.current = sessionId;
    cancelWork();
    return cancelWork;
  }, [cancelWork, sessionId, routeRequestId]);
  const restore = useCallback(
    (request: Request) => {
      pending.current = undefined;
      showHighlight(request.sourceMessageId);
      request.resolve({
        state: 'restored',
        messageId: request.sourceMessageId,
        requestId: request.requestId,
      });
    },
    [showHighlight],
  );
  const openMessage = useCallback(
    (
      input: { sourceMessageId: string; requestId: string },
      shouldSelectBranch: boolean,
      inWindow?: InWindowTarget,
    ): Promise<QuoteNavigationOutcome> => {
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
            const isSameBranch = () => {
              const state = client.getState(sessionId);
              return (
                state.status === 'ready' &&
                state.snapshot?.session.activeNodeId === inWindow?.activeNodeId
              );
            };
            if (inWindow && isSameBranch()) {
              const isRestored = await inWindow.scrollToMessage(input.sourceMessageId);
              if (!active()) return;
              if (isRestored && isSameBranch()) return restore(request);
            }
            if (shouldSelectBranch) {
              const source = await lookup();
              if (!active()) return;
              if (!source) return finish({ state: 'unavailable' });
              await client.selectMessage(sessionId, source.id);
              if (!active()) return;
            }
            const page = await api.get(`/agent-sessions/${sessionId}/messages`, {
              query: { aroundMessageId: input.sourceMessageId, aroundMode: 'exact', limit: 50 },
              signal: request.controller.signal,
            });
            if (!active()) return;
            const target = page.items.find((item) => item.id === input.sourceMessageId);
            if (!target) {
              if (!shouldSelectBranch) return finish({ state: 'unavailable' });
              const fresh = await lookup();
              return finish(
                fresh ? { state: 'retryable', reason: 'branch-changed' } : { state: 'unavailable' },
              );
            }
            const exactSource = completeChatQuoteSource(target, client, sessionId);
            if (!exactSource) return finish({ state: 'unavailable' });
            setNavigation({
              messageId: input.sourceMessageId,
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
              if (!shouldSelectBranch) return finish({ state: 'unavailable' });
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
    [api, cancel, client, restore, sessionId],
  );
  const openQuote = useCallback(
    (input: Parameters<typeof openMessage>[0]) => openMessage(input, true),
    [openMessage],
  );
  const openTurn = useCallback(
    (input: Parameters<typeof openMessage>[0], inWindow?: InWindowTarget) =>
      openMessage(input, false, inWindow),
    [openMessage],
  );
  const onTargetRestored = useCallback(
    (target: { dataKey: string; messageId: string }) => {
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
      restore(request);
    },
    [restore],
  );
  const onReady = useCallback(() => {
    const request = pending.current;
    if (request && navigation?.messageRequestId === request.windowId) {
      pending.current = undefined;
      request.resolve({ state: 'retryable', reason: 'scroll-failed' });
    }
  }, [navigation?.messageRequestId]);
  return { navigation, highlight, openQuote, openTurn, onTargetRestored, onReady, cancel };
}
