import type { InfiniteData, QueryClient, QueryFunctionContext } from '@tanstack/react-query';

import { queryKeys } from '@/frontend/data';
import type { DataServices } from '@/runtime/createDataServices';
import type { BranchMessagesResponse } from '@/shared/data/types/message';
import { messageWindowPolicy } from './messageWindowPolicy';

export const initialMessagesPageSize = messageWindowPolicy.initialFetchCount;
export const olderMessagesPageSize = messageWindowPolicy.olderFetchCount;

export type MessagesQueryKey = ReturnType<typeof getMessagesQueryKey>;

export function getMessagesQueryKey(topicId: string) {
  return queryKeys.messages.topic(topicId, {
    initial: initialMessagesPageSize,
    older: olderMessagesPageSize,
  });
}

export function getNextMessagesPageParam(lastPage: BranchMessagesResponse) {
  return lastPage.nextCursor;
}

export function fetchTopicMessagesPage(
  services: DataServices,
  topicId: string,
  context: QueryFunctionContext<MessagesQueryKey, string | undefined>,
) {
  return services.message.getBranchMessages(topicId, {
    cursor: context.pageParam,
    limit: context.pageParam ? olderMessagesPageSize : initialMessagesPageSize,
  });
}

export function prefetchTopicMessages(
  queryClient: QueryClient,
  services: DataServices,
  topicId: string,
) {
  return queryClient.prefetchInfiniteQuery<
    BranchMessagesResponse,
    Error,
    InfiniteData<BranchMessagesResponse, string | undefined>,
    MessagesQueryKey,
    string | undefined
  >({
    getNextPageParam: getNextMessagesPageParam,
    initialPageParam: undefined,
    queryFn: (context) => fetchTopicMessagesPage(services, topicId, context),
    queryKey: getMessagesQueryKey(topicId),
    staleTime: messageWindowPolicy.prefetchStaleTimeMs,
  });
}
