import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { useAgentSessionStatus } from '@/frontend/hooks/agent/useAgentSessionStatus';
import { AgentProtocolError } from '@/shared/contracts/agent';

import { type AgentSessionChatClient, isAgentSessionBusy } from './AgentSessionChatClient';
import {
  claimFollowup,
  enqueueFollowup,
  type FollowupQueueItem,
  type FollowupSendOutcome,
  readFollowupQueue,
  removeFollowup,
  reorderFollowups,
  setFollowupQueuePaused,
  settleFollowup,
  subscribeFollowupQueue,
} from './followupQueue';

export function useFollowupQueue({
  sessionId,
  client,
  isBusy,
  isReady,
}: {
  sessionId: string | undefined;
  client: AgentSessionChatClient;
  isBusy: boolean;
  isReady: boolean;
}) {
  const focused = useIsFocused();
  const status = useAgentSessionStatus(sessionId ?? 'draft');
  const completion = status?.completion;
  const answerGroupId = status?.answerGroupId;
  const queue = useSyncExternalStore(
    useCallback(
      (listener: () => void) =>
        sessionId ? subscribeFollowupQueue(sessionId, listener) : () => {},
      [sessionId],
    ),
    useCallback(() => readFollowupQueue(sessionId ?? ''), [sessionId]),
    useCallback(() => readFollowupQueue(sessionId ?? ''), [sessionId]),
  );

  const send = useCallback(
    async (id: string) => {
      if (!sessionId || !focused || !isReady || AppState.currentState !== 'active') return false;
      if (isAgentSessionBusy(client.getState(sessionId))) return false;
      const item = claimFollowup(sessionId, id);
      if (!item) return false;
      const completionId = client.getSessionStatus(sessionId)?.completion?.id ?? null;
      let outcome: FollowupSendOutcome = 'failed';
      try {
        await client.submitMessage(item.request);
        outcome = 'accepted';
        return true;
      } catch (error) {
        if (error instanceof AgentProtocolError && error.view.code === 'CANCELLED')
          outcome = 'cancelled';
        return false;
      } finally {
        settleFollowup(sessionId, id, outcome, completionId);
      }
    },
    [client, focused, isReady, sessionId],
  );

  useEffect(() => {
    if (!sessionId || !focused || !isReady || isBusy || AppState.currentState !== 'active') return;
    if (
      queue.isPaused ||
      queue.pendingId ||
      !completion?.succeeded ||
      completion.id !== answerGroupId
    )
      return;
    if (completion.id === queue.consumedCompletionId || completion.id === queue.stoppedGroupId)
      return;
    const head = queue.items[0];
    if (head) void send(head.id);
  }, [sessionId, focused, isReady, isBusy, queue, completion, answerGroupId, send]);

  return {
    ...queue,
    canSend: focused && isReady && !isBusy && !queue.pendingId,
    enqueue: (item: FollowupQueueItem) => {
      const status = client.getSessionStatus(item.request.sessionId);
      enqueueFollowup(
        item,
        status?.completion?.id === status?.answerGroupId ? null : (status?.completion?.id ?? null),
      );
    },
    send,
    remove: (id: string) => (sessionId ? removeFollowup(sessionId, id) : undefined),
    reorder: (items: typeof queue.items) => {
      if (sessionId) reorderFollowups(sessionId, items);
    },
    setPaused: (paused: boolean) => {
      if (sessionId) setFollowupQueuePaused(sessionId, paused);
    },
  };
}

export type FollowupQueueController = ReturnType<typeof useFollowupQueue>;
