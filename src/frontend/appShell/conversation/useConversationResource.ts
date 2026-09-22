import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId } from 'react';

import type { ConversationSession, ResourceRef } from './contracts';
import { useConversationSnapshot } from './useConversation';

/** A resource read belongs to this consumer and cannot survive its session binding. */
export function useConversationResource(session: ConversationSession, ref?: ResourceRef) {
  const queryClient = useQueryClient();
  const consumer = useId();
  const retired = useConversationSnapshot(session).freshness.state === 'retired';
  const queryKey = [
    'conversation',
    session.scope,
    session.ref.sessionId,
    'resource',
    ref,
    consumer,
  ] as const;
  useEffect(() => {
    const key = [
      'conversation',
      session.scope,
      session.ref.sessionId,
      'resource',
      ref,
      consumer,
    ] as const;
    const clear = () => {
      void queryClient.cancelQueries({ queryKey: key, exact: true });
      queryClient.removeQueries({ queryKey: key, exact: true });
    };
    if (retired) clear();
    return clear;
  }, [queryClient, session, ref, consumer, retired]);
  const query = useQuery({
    queryKey,
    enabled: Boolean(ref && !retired),
    queryFn: async ({ signal }) => {
      const value = await session.resources.read(ref!, signal);
      signal.throwIfAborted();
      return value;
    },
    staleTime: Infinity,
    retry: false,
    gcTime: 0,
  });
  return { ...query, data: retired ? undefined : query.data };
}
