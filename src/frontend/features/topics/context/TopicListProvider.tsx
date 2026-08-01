import { useQueryClient } from '@tanstack/react-query';
import { useIsFocused, useRouter } from 'expo-router';
import { createContext, type PropsWithChildren, use, useCallback, useEffect, useMemo } from 'react';
import { MODEL_SETTING_PREFERENCE_KEYS } from '@/frontend/components/modelPicker/utils/modelSettings';
import {
  queryKeys,
  useMutation,
  usePreference,
  usePrefetch,
  usePrefetchInfiniteQuery,
} from '@/frontend/data';
import { usePins, useTopics } from '@/frontend/hooks/chat';
import {
  getMessagesQueryKey,
  initialMessagesPageSize,
} from '@/frontend/hooks/chat/utils/messageQueryOptions';
import { messageWindowPolicy } from '@/frontend/hooks/chat/utils/messageWindowPolicy';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { isUniqueModelId } from '@cherrystudio/shared/data/types/model';
import type { Topic } from '@cherrystudio/shared/data/types/topic';

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
  const [defaultModelId] = usePreference(MODEL_SETTING_PREFERENCE_KEYS.default);
  const prefetch = usePrefetch();
  const prefetchInfiniteQuery = usePrefetchInfiniteQuery();
  const topicList = useTopics({ q: '' });
  const topicPins = usePins('topic');
  const isPinActionDisabled = topicPins.isLoading || topicPins.isRefreshing || topicPins.isMutating;

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    void prefetchDefaultModelDetail(prefetch, defaultModelId);

    for (const topic of topicList.topics.slice(
      0,
      messageWindowPolicy.topicListPrefetchTopicCount,
    )) {
      void prefetchInfiniteQuery('/topics/:topicId/messages', {
        limit: initialMessagesPageSize,
        params: { topicId: topic.id },
        staleTime: messageWindowPolicy.prefetchStaleTimeMs,
      });
    }
  }, [defaultModelId, isFocused, prefetch, prefetchInfiniteQuery, topicList.topics]);

  const openTopic = useCallback(
    (topicId: string) => {
      perfLog.debug('[PERF] tap->push', { topicId, t: Date.now() });
      void prefetchDefaultModelDetail(prefetch, defaultModelId);
      void prefetchInfiniteQuery('/topics/:topicId/messages', {
        limit: initialMessagesPageSize,
        params: { topicId },
        staleTime: messageWindowPolicy.prefetchStaleTimeMs,
      });
      router.push({ pathname: '/topics', params: { topicId } });
    },
    [defaultModelId, prefetch, prefetchInfiniteQuery, router],
  );

  const renameTopicMutation = useMutation('PATCH', '/topics/:id', {
    refresh: ({ args }) => ['/topics', ...(args ? [`/topics/${args.params.id}`] : [])],
  });

  const deleteTopicsMutation = useMutation('DELETE', '/topics', {
    refresh: ['/topics'],
  });
  const updateTopic = renameTopicMutation.trigger;
  const removeTopics = deleteTopicsMutation.trigger;

  const renameTopic = useCallback(
    async (id: string, name: string) => {
      const trimmedName = name.trim();

      if (!trimmedName) {
        return;
      }

      await updateTopic({
        body: { isNameManuallyEdited: true, name: trimmedName },
        params: { id },
      });
    },
    [updateTopic],
  );

  const deleteTopic = useCallback(
    async (id: string) => {
      await removeTopics({ query: { ids: [id] } });
      queryClient.removeQueries({ queryKey: queryKeys.topics.detail(id) });
      queryClient.removeQueries({ queryKey: getMessagesQueryKey(id) });
    },
    [queryClient, removeTopics],
  );

  const deleteTopics = useCallback(
    async (ids: readonly string[]) => {
      const uniqueIds = [...new Set(ids)];
      if (uniqueIds.length === 0) {
        return;
      }

      await removeTopics({ query: { ids: uniqueIds } });
      for (const id of uniqueIds) {
        queryClient.removeQueries({ queryKey: queryKeys.topics.detail(id) });
        queryClient.removeQueries({ queryKey: getMessagesQueryKey(id) });
      }
    },
    [queryClient, removeTopics],
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

function prefetchDefaultModelDetail(prefetch: ReturnType<typeof usePrefetch>, modelId: unknown) {
  if (!isUniqueModelId(modelId)) {
    return;
  }

  return prefetch('/models/:uniqueModelId*', {
    params: { uniqueModelId: modelId },
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
