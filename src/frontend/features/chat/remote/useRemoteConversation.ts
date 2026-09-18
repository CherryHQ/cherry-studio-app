import { useInfiniteQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  useRemoteActions,
  useRemoteAgent,
  useRemoteConnection,
} from '@/frontend/appShell/remoteAgent';
import type {
  ControllerMessage,
  ControllerSessionSnapshot,
} from '@/shared/contracts/agent/controller';

import { presentRemoteMessage } from './remoteMessagePresentation';

export const isRemoteExecutionTerminal = (status: ControllerSessionSnapshot['status']) =>
  ['idle', 'done', 'error', 'aborted'].includes(status);

export function useRemoteConversation(sessionId?: string) {
  const { controller, connectionId } = useRemoteAgent();
  const connection = useRemoteConnection();
  const actions = useRemoteActions();
  const [snapshot, setSnapshot] = useState<ControllerSessionSnapshot>();
  const [live, setLive] = useState<ControllerMessage[]>([]);
  const sequence = useRef(0);
  const history = useInfiniteQuery({
    queryKey: ['agentController', connectionId, connection.sourceKey, sessionId, 'history'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => controller.history(sessionId!, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(sessionId) && connection.status === 'ready',
    staleTime: 0,
    retry: false,
  });
  const refetchHistory = history.refetch;
  useFocusEffect(
    useCallback(() => {
      if (!sessionId) return;
      setSnapshot((previous) => (previous ? { ...previous, current: false } : previous));
      let wasTerminal = false;
      let executionIds: string | undefined;
      const unsubscribe = controller.observe(sessionId, (next) => {
        setSnapshot(next);
        if (next.liveMessages.length) setLive(next.liveMessages);
        if (!next.current) {
          ++sequence.current;
          wasTerminal = false;
          executionIds = undefined;
          return;
        }
        const isTerminal = isRemoteExecutionTerminal(next.status);
        const nextExecutionIds = next.executions.map((execution) => execution.id).join('\n');
        if (wasTerminal && !isTerminal) ++sequence.current;
        if ((isTerminal && !wasTerminal) || (!isTerminal && nextExecutionIds !== executionIds)) {
          const current = ++sequence.current;
          // New PC executions may add user messages; retain live replies until terminal persistence.
          void refetchHistory().then((result) => {
            if (isTerminal && !result.isError && current === sequence.current) setLive([]);
          });
        }
        if (!isTerminal) setLive(next.liveMessages);
        wasTerminal = isTerminal;
        executionIds = nextExecutionIds;
      });
      void refetchHistory();
      return () => {
        ++sequence.current;
        unsubscribe();
        setSnapshot((previous) => (previous ? { ...previous, current: false } : previous));
      };
    }, [controller, sessionId, refetchHistory]),
  );
  useEffect(() => {
    if (sessionId && connection.status === 'ready') void refetchHistory();
  }, [actions, connection.status, refetchHistory, sessionId]);
  const messages = useMemo(() => {
    const durable = history.data?.pages.flatMap((page) => page.items).toReversed() ?? [];
    const byId = new Map(durable.map((message) => [message.id, message]));
    for (const message of live) byId.set(message.id, message);
    return [...byId.values()].map(presentRemoteMessage);
  }, [history.data, live]);
  return { history, messages, snapshot };
}
