import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQuery } from '@/frontend/data';
import type { UpdateTopicDto } from '@/shared/data/api/schemas/topics';
import type { Topic } from '@/shared/data/types/topic';
import { useHydrateTopicDetails } from './useHydrateTopicDetails';

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
  const query = useInfiniteQuery('/topics', {
    limit: defaultPageSize,
    query: { q: queryText },
  });

  const topics = useMemo(() => query.pages.flatMap((page) => page.items), [query.pages]);

  useHydrateTopicDetails(topics);

  return {
    isLoadingInitial: query.isLoading,
    loadMore: query.loadNext,
    topics,
  };
}

export function useTopic(topicId: string | undefined) {
  return useQuery('/topics/:id', {
    enabled: Boolean(topicId),
    params: { id: topicId ?? '' },
  });
}

export function useTopicMutations() {
  const updateMutation = useMutation('PATCH', '/topics/:id', {
    refresh: ({ args }) => [
      '/topics',
      ...(args ? [`/topics/${args.params.id}`, `/topics/${args.params.id}/messages`] : []),
    ],
  });
  const updateTopicRequest = updateMutation.trigger;

  const updateTopic = useCallback(
    (id: string, patch: UpdateTopicDto) => {
      if (!id) {
        throw new Error('updateTopic called with empty id');
      }
      return updateTopicRequest({ body: patch, params: { id } });
    },
    [updateTopicRequest],
  );

  return {
    updateTopic,
    isUpdating: updateMutation.isLoading,
    updateMutation,
  };
}
