import { useToast } from '@cherrystudio/ui/components';
import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import { useAgentSessionStatus } from '@/frontend/hooks/agent/useAgentSessionStatus';
import { AgentProtocolError } from '@/shared/contracts/agent';

import { type AgentSessionChatClient, isAgentSessionBusy } from './AgentSessionChatClient';
import {
  claimFollowup,
  enqueueFollowup,
  type FollowupQueueItem,
  readFollowupQueue,
  removeFollowup,
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
  const { t } = useTranslation();
  const { toast } = useToast();
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
      let accepted = false;
      try {
        await client.submitMessage(item.request);
        accepted = true;
        return true;
      } catch (error) {
        if (!(error instanceof AgentProtocolError && error.view.code === 'CANCELLED'))
          toast.show({ label: t('chat.queue.sendFailed'), variant: 'danger' });
        return false;
      } finally {
        settleFollowup(sessionId, id, accepted, completionId);
      }
    },
    [client, focused, isReady, sessionId, t, toast],
  );

  useEffect(() => {
    if (!sessionId || !focused || !isReady || isBusy || AppState.currentState !== 'active') return;
    // Stop can retain drafts after render but before this effect dispatches.
    const currentQueue = readFollowupQueue(sessionId);
    if (currentQueue.pendingId || !completion?.succeeded || completion.id !== answerGroupId) return;
    if (completion.id === currentQueue.consumedCompletionId) return;
    const head = currentQueue.items.find((item) => !item.isManualSendRequired);
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
  };
}

export type FollowupQueueController = ReturnType<typeof useFollowupQueue>;
