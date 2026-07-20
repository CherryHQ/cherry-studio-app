import { useQueryClient } from '@tanstack/react-query';
import { useIsFocused, useRouter } from 'expo-router';
import { createContext, type PropsWithChildren, use, useCallback, useEffect, useMemo } from 'react';

import { queryKeys } from '@/data/api';
import { useDataMutation } from '@/data/hooks';
import { useDataServices } from '@/data/runtime';
import type { Topic } from '@/data/types/topic';
import { useTopics } from '@/hooks/chat';
import { prefetchTopicMessages } from '@/hooks/chat/utils/messageQueryOptions';
import { messageWindowPolicy } from '@/hooks/chat/utils/messageWindowPolicy';

type TopicListTopicsContextValue = {
  isTopicListLoading: boolean;
  topics: readonly Topic[];
};

type TopicListActionsContextValue = {
  deleteTopic: (topicId: string) => Promise<void>;
  loadMoreTopics: () => void;
  openNewTopic: () => void;
  openTopic: (topicId: string) => void;
  renameTopic: (topicId: string, name: string) => Promise<void>;
};

const TopicListTopicsContext = createContext<TopicListTopicsContextValue | null>(null);
const TopicListActionsContext = createContext<TopicListActionsContextValue | null>(null);

export function TopicListProvider({ children }: PropsWithChildren) {
  const isFocused = useIsFocused();
  const queryClient = useQueryClient();
  const router = useRouter();
  const services = useDataServices();
  const topicList = useTopics({ q: '' });

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    for (const topic of topicList.topics.slice(
      0,
      messageWindowPolicy.topicListPrefetchTopicCount,
    )) {
      void prefetchTopicMessages(queryClient, services, topic.id);
    }
  }, [isFocused, queryClient, services, topicList.topics]);

  const openNewTopic = useCallback(() => {
    router.push('/topics');
  }, [router]);

  const openTopic = useCallback(
    (topicId: string) => {
      void prefetchTopicMessages(queryClient, services, topicId);
      router.push({ pathname: '/topics', params: { topicId } });
    },
    [queryClient, router, services],
  );

  const renameTopicMutation = useDataMutation({
    invalidateQueries: [['/topics']],
    mutationFn: (dataServices, variables: { id: string; name: string }) =>
      dataServices.topic.update(variables.id, {
        isNameManuallyEdited: true,
        name: variables.name,
      }),
    onSuccess: (_topic, variables) =>
      queryClient.invalidateQueries({ queryKey: queryKeys.topics.detail(variables.id) }),
  });

  const deleteTopicMutation = useDataMutation({
    invalidateQueries: [['/topics']],
    mutationFn: (dataServices, id: string) => dataServices.topic.delete(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.topics.detail(id) });
    },
  });

  const renameTopic = useCallback(
    async (id: string, name: string) => {
      const trimmedName = name.trim();

      if (!trimmedName) {
        return;
      }

      await renameTopicMutation.mutateAsync({ id, name: trimmedName });
    },
    [renameTopicMutation],
  );

  const deleteTopic = useCallback(
    async (id: string) => {
      await deleteTopicMutation.mutateAsync(id);
    },
    [deleteTopicMutation],
  );

  const topicsValue = useMemo(
    () => ({
      isTopicListLoading: topicList.isLoadingInitial,
      topics: topicList.topics,
    }),
    [topicList.isLoadingInitial, topicList.topics],
  );
  const actionsValue = useMemo(
    () => ({
      deleteTopic,
      loadMoreTopics: topicList.loadMore,
      openNewTopic,
      openTopic,
      renameTopic,
    }),
    [deleteTopic, openNewTopic, openTopic, renameTopic, topicList.loadMore],
  );

  return (
    <TopicListTopicsContext value={topicsValue}>
      <TopicListActionsContext value={actionsValue}>{children}</TopicListActionsContext>
    </TopicListTopicsContext>
  );
}

export function useTopicListTopics() {
  const context = use(TopicListTopicsContext);

  if (!context) {
    throw new Error('useTopicListTopics must be used within a TopicListProvider');
  }

  return context;
}

export function useTopicListActions() {
  const context = use(TopicListActionsContext);

  if (!context) {
    throw new Error('useTopicListActions must be used within a TopicListProvider');
  }

  return context;
}
