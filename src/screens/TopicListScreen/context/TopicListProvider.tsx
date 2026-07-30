import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useIsFocused, useRouter } from 'expo-router';
import { createContext, type PropsWithChildren, use, useCallback, useEffect, useMemo } from 'react';

import { MODEL_SETTING_PREFERENCE_KEYS } from '@/components/modelPicker/utils/modelSettings';
import { loggerService } from '@/core/logger/LoggerService';
import { queryKeys } from '@/data/api';
import { useDataMutation } from '@/data/hooks';
import { isUniqueModelId } from '@/data/types/model';
import type { Topic } from '@/data/types/topic';
import { usePins, useTopics } from '@/hooks/chat';
import { getMessagesQueryKey, prefetchTopicMessages } from '@/hooks/chat/utils/messageQueryOptions';
import { messageWindowPolicy } from '@/hooks/chat/utils/messageWindowPolicy';
import { useDataServices } from '@/runtime';
import type { DataServices } from '@/runtime/createDataServices';

const MODEL_DETAIL_PREFETCH_STALE_TIME_MS = 1000 * 60 * 5;

type TopicListTopicsContextValue = {
  isPinActionDisabled: boolean;
  isTopicListLoading: boolean;
  pinnedTopicIds: readonly string[];
  topics: readonly Topic[];
};

type TopicListActionsContextValue = {
  deleteTopic: (topicId: string) => Promise<void>;
  deleteTopics: (topicIds: readonly string[]) => Promise<void>;
  loadMoreTopics: () => void;
  openTopic: (topicId: string) => void;
  renameTopic: (topicId: string, name: string) => Promise<void>;
  toggleTopicPin: (topicId: string) => Promise<void>;
};

// 诊断埋点：量化「点击 topic → 进入界面 → 渲染」链路耗时。`[PERF]` 前缀。
const perfLog = loggerService.withContext('ChatPerf');

const TopicListTopicsContext = createContext<TopicListTopicsContextValue | null>(null);
const TopicListActionsContext = createContext<TopicListActionsContextValue | null>(null);

export function TopicListProvider({ children }: PropsWithChildren) {
  const isFocused = useIsFocused();
  const queryClient = useQueryClient();
  const router = useRouter();
  const services = useDataServices();
  const topicList = useTopics({ q: '' });
  const topicPins = usePins('topic');
  const isPinActionDisabled = topicPins.isLoading || topicPins.isRefreshing || topicPins.isMutating;

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    void prefetchDefaultModelDetail(queryClient, services);

    for (const topic of topicList.topics.slice(
      0,
      messageWindowPolicy.topicListPrefetchTopicCount,
    )) {
      void prefetchTopicMessages(queryClient, services, topic.id);
    }
  }, [isFocused, queryClient, services, topicList.topics]);

  const openTopic = useCallback(
    (topicId: string) => {
      perfLog.debug('[PERF] tap->push', { topicId, t: Date.now() });
      void prefetchDefaultModelDetail(queryClient, services);
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

  const { mutateAsync: deleteManyTopics } = useDataMutation({
    invalidateQueries: [['/topics']],
    mutationFn: (dataServices, ids: readonly string[]) => dataServices.topic.deleteMany(ids),
    onSuccess: (_result, ids) => {
      for (const id of ids) {
        queryClient.removeQueries({ queryKey: queryKeys.topics.detail(id) });
        queryClient.removeQueries({ queryKey: getMessagesQueryKey(id) });
      }
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
      await deleteManyTopics([id]);
    },
    [deleteManyTopics],
  );

  const deleteTopics = useCallback(
    async (ids: readonly string[]) => {
      const uniqueIds = [...new Set(ids)];
      if (uniqueIds.length === 0) {
        return;
      }

      await deleteManyTopics(uniqueIds);
    },
    [deleteManyTopics],
  );

  const toggleTopicPin = useCallback(
    async (topicId: string) => {
      if (isPinActionDisabled) {
        return;
      }

      await topicPins.togglePin(topicId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.topics.all() });
    },
    [isPinActionDisabled, queryClient, topicPins.togglePin],
  );

  const topicsValue = useMemo(
    () => ({
      isPinActionDisabled,
      isTopicListLoading: topicList.isLoadingInitial,
      pinnedTopicIds: topicPins.pinnedIds,
      topics: topicList.topics,
    }),
    [isPinActionDisabled, topicList.isLoadingInitial, topicList.topics, topicPins.pinnedIds],
  );
  const actionsValue = useMemo(
    () => ({
      deleteTopic,
      deleteTopics,
      loadMoreTopics: topicList.loadMore,
      openTopic,
      renameTopic,
      toggleTopicPin,
    }),
    [deleteTopic, deleteTopics, openTopic, renameTopic, topicList.loadMore, toggleTopicPin],
  );

  return (
    <TopicListTopicsContext value={topicsValue}>
      <TopicListActionsContext value={actionsValue}>{children}</TopicListActionsContext>
    </TopicListTopicsContext>
  );
}

function prefetchDefaultModelDetail(queryClient: QueryClient, services: DataServices) {
  const modelId = services.preference.getCachedValue(MODEL_SETTING_PREFERENCE_KEYS.default);

  if (!isUniqueModelId(modelId)) {
    return;
  }

  return queryClient.prefetchQuery({
    queryFn: () => services.model.getById(modelId),
    queryKey: queryKeys.models.detail(modelId),
    staleTime: MODEL_DETAIL_PREFETCH_STALE_TIME_MS,
  });
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
