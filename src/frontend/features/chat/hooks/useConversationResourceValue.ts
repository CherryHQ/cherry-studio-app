import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId } from 'react';

import type { ResourceRead, ResourceValue } from '@/frontend/appShell/conversation';

/**
 * Inline values render immediately. Deferred desktop content is read by this consumer only while
 * mounted and never survives its owner's retirement.
 */
export function useConversationResourceValue(
  resource: ResourceRead | undefined,
  retired = false,
): {
  data: ResourceValue | undefined;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  refetch(): void;
} {
  const queryClient = useQueryClient();
  const consumer = useId();
  const deferred = resource?.kind === 'deferred' ? resource : undefined;
  const queryKey = ['conversation-resource', deferred?.key, consumer] as const;
  useEffect(() => {
    if (!deferred) return;
    const key = ['conversation-resource', deferred.key, consumer] as const;
    const clear = () => {
      void queryClient.cancelQueries({ queryKey: key, exact: true });
      queryClient.removeQueries({ queryKey: key, exact: true });
    };
    if (retired) clear();
    return clear;
  }, [queryClient, deferred, consumer, retired]);
  const query = useQuery({
    queryKey,
    enabled: Boolean(deferred && !retired),
    queryFn: async ({ signal }) => {
      const value = await deferred!.read(signal);
      signal.throwIfAborted();
      return value;
    },
    staleTime: Infinity,
    retry: false,
    gcTime: 0,
  });
  if (resource?.kind === 'inline')
    return {
      data: retired ? undefined : resource.value,
      isPending: false,
      isSuccess: !retired,
      isError: false,
      refetch: () => {},
    };
  return {
    data: retired ? undefined : query.data,
    isPending: Boolean(deferred) && query.isPending,
    isSuccess: query.isSuccess,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
