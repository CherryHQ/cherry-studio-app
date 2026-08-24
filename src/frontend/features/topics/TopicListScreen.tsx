import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import SearchIcon from '@cherrystudio/app-icons/icons/search';
import { type MenuItem } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useAppSearch } from '@/frontend/components/appSearch';
import { RouteHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
import {
  SelectionControls,
  SelectionProvider,
  useSelectionActions,
  useSelectionState,
} from '@/frontend/components/selection';
import { useApiClient } from '@/frontend/data/DataApiProvider';
import type { TopicListItem } from '@/shared/data/api/schemas/topics';

import { TopicList } from './TopicList';

const topicSelectionScope = 'conversations';

/**
 * Full topic management page (`/topics`), reached from the sidebar's
 * "view all" row: app-search entry plus multi-select batch deletion. Search
 * returns one topic, and this screen alone decides to open it.
 */
function TopicListScreenBody() {
  const { t } = useTranslation();
  const router = useRouter();
  const dataApi = useApiClient();
  const { open: openAppSearch } = useAppSearch();
  const { enterEditing, exitEditing } = useSelectionActions();
  const { isDeletionPending, isEditing } = useSelectionState();
  const handleEnterEditing = useCallback(() => {
    if (isDeletionPending) {
      return;
    }

    enterEditing();
  }, [enterEditing, isDeletionPending]);
  const openNewChat = useCallback(() => {
    router.navigate({ params: {}, pathname: '/' });
  }, [router]);
  const openTopic = useCallback(
    (topic: TopicListItem) => {
      router.navigate({ params: { topicId: topic.id }, pathname: '/' });
    },
    [router],
  );
  const openTopicSearch = useCallback(() => {
    void openAppSearch<TopicListItem>({
      emptyText: t('navigation.noMatchingChats'),
      getAccessibilityLabel: (topic) => topic.name,
      keyExtractor: (topic) => topic.id,
      placeholder: t('navigation.search'),
      renderItem: (topic) => <TopicSearchResult topic={topic} />,
      search: async ({ cursor, query, signal }) => {
        const page = await dataApi.get('/topics', {
          query: {
            cursor,
            limit: 50,
            q: query.trim() || undefined,
          },
        });

        if (signal.aborted) {
          throw new Error('Topic search was cancelled');
        }

        return {
          groups: [{ items: page.items, key: 'topics' }],
          nextCursor: page.nextCursor,
        };
      },
    }).then((outcome) => {
      if (outcome.type === 'selected') {
        openTopic(outcome.item);
      }
    });
  }, [dataApi, openAppSearch, openTopic, t]);
  const menuItems = useMemo<readonly MenuItem[]>(
    () => [
      {
        id: 'create-chat',
        label: t('navigation.newChat'),
        onPress: openNewChat,
      },
      {
        disabled: isDeletionPending,
        id: 'select-messages',
        label: t('topic.selection.start'),
        onPress: handleEnterEditing,
      },
    ],
    [handleEnterEditing, isDeletionPending, openNewChat, t],
  );
  const menuActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('navigation.search'),
        icon: SearchIcon,
        key: 'search-topics',
        onPress: openTopicSearch,
        type: 'icon',
      },
      {
        accessibilityLabel: t('common.more'),
        icon: EllipsisIcon,
        items: menuItems,
        key: 'topic-actions',
        type: 'menu',
      },
    ],
    [menuItems, openTopicSearch, t],
  );
  const doneActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.done'),
        disabled: isDeletionPending,
        key: 'finish-selecting-messages',
        label: t('common.done'),
        onPress: exitEditing,
        type: 'label',
      },
    ],
    [exitEditing, isDeletionPending, t],
  );
  return (
    <>
      <RouteHeader
        rightActions={isEditing ? doneActions : menuActions}
        title={t('topic.list.title')}
      />
      <View className="flex-1 bg-background">
        <TopicList />
        <SelectionControls scope={topicSelectionScope} />
      </View>
    </>
  );
}

function TopicSearchResult({ topic }: { topic: TopicListItem }) {
  const latestMessage = topic.latestMessageText.replace(/\s+/g, ' ').trim();

  return (
    <View className="min-h-12 gap-0.5 py-1">
      <Text className="font-medium text-base text-foreground" numberOfLines={1}>
        {topic.name}
      </Text>
      {latestMessage ? (
        <Text className="text-foreground-tertiary text-sm" numberOfLines={1}>
          {latestMessage}
        </Text>
      ) : null}
    </View>
  );
}

export function TopicListScreen() {
  return (
    <SelectionProvider>
      <TopicListScreenBody />
    </SelectionProvider>
  );
}
