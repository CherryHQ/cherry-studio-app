import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { useIsFocused, useRouter } from 'expo-router';
import { createContext, type PropsWithChildren, use, useCallback, useEffect, useMemo } from 'react';
import { MODEL_SETTING_PREFERENCE_KEYS } from '@/frontend/components/modelPicker/utils/modelSettings';
import { queryKeys, useBackendModule } from '@/frontend/data';
import { usePins, useTopics } from '@/frontend/hooks/chat';
import {
  getMessagesQueryKey,
  prefetchTopicMessages,
} from '@/frontend/hooks/chat/utils/messageQueryOptions';
import { messageWindowPolicy } from '@/frontend/hooks/chat/utils/messageWindowPolicy';
import type { ModelsBackend, PreferencesBackend } from '@/shared/contracts';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { isUniqueModelId } from '@/shared/data/types/model';
import type { Topic } from '@/shared/data/types/topic';

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
  const chat = useBackendModule('chat');
  const models = useBackendModule('models');
  const preferences = useBackendModule('preferences');
  const topics = useBackendModule('topics');
  const topicList = useTopics({ q: '' });
  const topicPins = usePins('topic');
  const isPinActionDisabled = topicPins.isLoading || topicPins.isRefreshing || topicPins.isMutating;

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    void prefetchDefaultModelDetail(queryClient, models, preferences);

    for (const topic of topicList.topics.slice(
      0,
      messageWindowPolicy.topicListPrefetchTopicCount,
    )) {
      void prefetchTopicMessages(queryClient, chat, topic.id);
    }
  }, [chat, isFocused, models, preferences, queryClient, topicList.topics]);

  const openTopic = useCallback(
    (topicId: string) => {
      perfLog.debug('[PERF] tap->push', { topicId, t: Date.now() });
      void prefetchDefaultModelDetail(queryClient, models, preferences);
      void prefetchTopicMessages(queryClient, chat, topicId);
      router.push({ pathname: '/topics', params: { topicId } });
    },
    [chat, models, preferences, queryClient, router],
  );

  const renameTopicMutation = useMutation({
    mutationFn: (variables: { id: string; name: string }) =>
      topics.update(variables.id, {
        isNameManuallyEdited: true,
        name: variables.name,
      }),
    onSuccess: async (_topic, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.topics.all() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.topics.detail(variables.id) }),
      ]);
    },
  });

  const { mutateAsync: deleteManyTopics } = useMutation({
    mutationFn: (ids: readonly string[]) => topics.removeMany(ids),
    onSuccess: async (_result, ids) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.topics.all() });
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

function prefetchDefaultModelDetail(
  queryClient: QueryClient,
  models: ModelsBackend,
  preferences: PreferencesBackend,
) {
  const modelId = preferences.readCached(MODEL_SETTING_PREFERENCE_KEYS.default);

  if (!isUniqueModelId(modelId)) {
    return;
  }

  return queryClient.prefetchQuery({
    queryFn: () => models.get(modelId),
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
