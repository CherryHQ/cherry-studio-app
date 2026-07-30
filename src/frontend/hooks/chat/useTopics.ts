import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { queryKeys, useBackendModule } from '@/frontend/data';
import type { UpdateTopicDto } from '@/shared/data/api/schemas/topics';
import type { CursorPaginationResponse } from '@/shared/data/api/types';
import type { Topic } from '@/shared/data/types/topic';
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
  const topicsBackend = useBackendModule('topics');
  const queryText = options.q.trim() || undefined;

  const query = useInfiniteQuery<
    CursorPaginationResponse<Topic>,
    Error,
    InfiniteData<CursorPaginationResponse<Topic>, string | undefined>,
    TopicsQueryKey,
    string | undefined
  >({
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined,
    queryFn: ({ pageParam }) =>
      topicsBackend.listPage({
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
  const topics = useBackendModule('topics');
  const enabled = Boolean(topicId);
  const queryTopicId = topicId ?? '__missing_topic__';

  return useQuery<Topic, Error, Topic, TopicDetailQueryKey>({
    enabled,
    queryFn: () => topics.get(topicId ?? ''),
    queryKey: queryKeys.topics.detail(queryTopicId),
  });
}

export function useTopicMutations() {
  const queryClient = useQueryClient();
  const topics = useBackendModule('topics');

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

      return topics.update(id, patch);
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
