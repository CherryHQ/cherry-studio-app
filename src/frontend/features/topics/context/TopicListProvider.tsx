import type { TopicListItem } from '@cherrystudio/universal/data/api/schemas/topics';
import type { CursorPaginationResponse } from '@cherrystudio/universal/data/api/types';
import type { Topic } from '@cherrystudio/universal/data/types/topic';
import { type InfiniteData, useQueryClient } from '@tanstack/react-query';
import { createContext, type PropsWithChildren, use, useCallback, useMemo } from 'react';

import { queryKeys, useMutation } from '@/frontend/data';
import {
  dataApiCollectionFilters,
  removeItemsFromInfiniteData,
  restoreQuerySnapshot,
  updateQueriesOptimistically,
} from '@/frontend/data/utils/optimisticQueryUpdate';
import { usePins, useTopics } from '@/frontend/hooks/chat';
import { getMessagesQueryKey } from '@/frontend/hooks/chat/utils/messageQueryOptions';

type TopicListData = InfiniteData<CursorPaginationResponse<TopicListItem>, string | undefined>;

type TopicListTopicsContextValue = {
  isPinActionDisabled: boolean;
  isTopicListLoading: boolean;
  pinnedTopicIds: readonly string[];
  topics: readonly TopicListItem[];
};

type TopicListActionsContextValue = {
  deleteTopic: (topicId: string) => Promise<void>;
  deleteTopics: (topicIds: readonly string[]) => Promise<void>;
  loadMoreTopics: () => void;
  renameTopic: (topicId: string, name: string) => Promise<void>;
  toggleTopicPin: (topicId: string) => Promise<void>;
};

const TopicListTopicsContext = createContext<TopicListTopicsContextValue | null>(null);
const TopicListActionsContext = createContext<TopicListActionsContextValue | null>(null);

type TopicListProviderProps = PropsWithChildren<{
  searchText?: string;
}>;

export function TopicListProvider({ children, searchText = '' }: TopicListProviderProps) {
  const queryClient = useQueryClient();
  const topicList = useTopics({ q: searchText });
  const topicPins = usePins('topic');
  const togglePin = topicPins.togglePin;
  const isPinActionDisabled = topicPins.isLoading || topicPins.isRefreshing || topicPins.isMutating;

  const renameTopicMutation = useMutation('PATCH', '/topics/:id', {
    onMutate: async (variables) => {
      const id = variables?.params.id;
      const name = variables?.body?.name;
      if (!id || !name) {
        return {};
      }

      const topicFilters = dataApiCollectionFilters('/topics');
      const detailFilters = { exact: true, queryKey: queryKeys.topics.detail(id) };
      await Promise.all([
        queryClient.cancelQueries(topicFilters),
        queryClient.cancelQueries(detailFilters),
      ]);
      const topics = queryClient.getQueriesData<TopicListData>(topicFilters);
      const detail = queryClient.getQueriesData<Topic>(detailFilters);

      try {
        queryClient.setQueriesData<TopicListData>(topicFilters, (current) =>
          renameTopicInInfiniteData(current, id, name),
        );
        queryClient.setQueriesData<Topic>(detailFilters, (current) =>
          current ? { ...current, isNameManuallyEdited: true, name } : current,
        );
      } catch (error) {
        restoreQuerySnapshot(queryClient, topics);
        restoreQuerySnapshot(queryClient, detail);
        throw error;
      }

      return { detail, topics };
    },
    onError: (_error, _variables, context) => {
      restoreQuerySnapshot(queryClient, context?.topics);
      restoreQuerySnapshot(queryClient, context?.detail);
    },
    refresh: ({ args }) => ['/topics', ...(args ? [`/topics/${args.params.id}`] : [])],
  });

  const deleteTopicsMutation = useMutation('DELETE', '/topics', {
    onMutate: async (variables) => {
      const ids = new Set(normalizeTopicIds(variables?.query?.ids));
      const topics = await updateQueriesOptimistically<TopicListData>(
        queryClient,
        dataApiCollectionFilters('/topics'),
        (current) => removeItemsFromInfiniteData(current, ids),
      );

      return { topics };
    },
    onError: (_error, _variables, context) => {
      restoreQuerySnapshot(queryClient, context?.topics);
    },
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

      await togglePin(topicId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.topics.all() });
    },
    [isPinActionDisabled, queryClient, togglePin],
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
      renameTopic,
      toggleTopicPin,
    }),
    [deleteTopic, deleteTopics, renameTopic, topicList.loadMore, toggleTopicPin],
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

function normalizeTopicIds(ids: string | readonly string[] | undefined): string[] {
  if (Array.isArray(ids)) {
    return ids;
  }

  return typeof ids === 'string'
    ? ids
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    : [];
}

function renameTopicInInfiniteData(
  current: TopicListData | undefined,
  topicId: string,
  name: string,
): TopicListData | undefined {
  if (!current) {
    return current;
  }

  let changed = false;
  const pages = current.pages.map((page) => {
    let pageChanged = false;
    const items = page.items.map((topic) => {
      if (topic.id !== topicId) {
        return topic;
      }

      changed = true;
      pageChanged = true;
      return { ...topic, isNameManuallyEdited: true, name };
    });

    return pageChanged ? { ...page, items } : page;
  });

  return changed ? { ...current, pages } : current;
}
