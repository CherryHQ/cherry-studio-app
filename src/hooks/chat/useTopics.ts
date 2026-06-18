import { type InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { queryKeys } from '@/data/api';
import type { UpdateTopicDto } from '@/data/api/schemas/topics';
import { useDataInfiniteQuery, useDataQuery } from '@/data/hooks/useDataQuery';
import { useDataServices } from '@/data/runtime';
import type { CursorPaginationResponse } from '@/data/types/apiTypes';
import type { Topic } from '@/data/types/topic';
import { useHydrateTopicDetails } from './useHydrateTopicDetails';
import { getMessagesQueryKey } from './utils/messageQueryOptions';

type TopicsQueryKey = ReturnType<typeof queryKeys.topics.list>;
type TopicDetailQueryKey = ReturnType<typeof queryKeys.topics.detail>;

export type TopicsOptions = {
  q: string;
};

export type TopicsViewModel = {
  isLoadingInitial: boolean;
  loadMore: () => Promise<void>;
  topics: readonly Topic[];
};

const defaultPageSize = 50;

export function useTopics(options: TopicsOptions): TopicsViewModel {
  const queryText = options.q.trim() || undefined;

  const query = useDataInfiniteQuery<
    CursorPaginationResponse<Topic>,
    Error,
    InfiniteData<CursorPaginationResponse<Topic>, string | undefined>,
    TopicsQueryKey,
    string | undefined
  >({
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined,
    queryFn: (services, { pageParam }) =>
      services.topic.listByCursor({
        cursor: pageParam,
        limit: defaultPageSize,
        q: queryText,
      }),
    queryKey: queryKeys.topics.list({ limit: defaultPageSize, q: queryText }),
  });

  const topics = useMemo(
    () => (query.data?.pages ?? []).flatMap((page) => page.items),
    [query.data?.pages],
  );

  useHydrateTopicDetails(topics);

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;

  const loadMore = useCallback(async () => {
    if (!hasNextPage || isFetchingNextPage) {
      return;
    }

    await fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return {
    isLoadingInitial: query.isLoading,
    loadMore,
    topics,
  };
}

export function useTopic(topicId: string | undefined) {
  const enabled = Boolean(topicId);
  const queryTopicId = topicId ?? '__missing_topic__';

  return useDataQuery<Topic, Error, Topic, TopicDetailQueryKey>({
    enabled,
    queryFn: (services) => services.topic.getById(topicId ?? ''),
    queryKey: queryKeys.topics.detail(queryTopicId),
  });
}

export function useTopicMutations() {
  const queryClient = useQueryClient();
  const services = useDataServices();

  const invalidateTopic = useCallback(
    async (topicId: string) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.topics.all() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.topics.detail(topicId) }),
        queryClient.invalidateQueries({ queryKey: getMessagesQueryKey(topicId) }),
      ]);
    },
    [queryClient],
  );

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTopicDto }) => {
      if (!id) {
        throw new Error('updateTopic called with empty id');
      }

      return services.topic.update(id, patch);
    },
    onSuccess: (topic) => invalidateTopic(topic.id),
  });

  const updateTopic = useCallback(
    (id: string, patch: UpdateTopicDto) => updateMutation.mutateAsync({ id, patch }),
    [updateMutation],
  );

  return {
    updateTopic,
    isUpdating: updateMutation.isPending,
    updateMutation,
  };
}
