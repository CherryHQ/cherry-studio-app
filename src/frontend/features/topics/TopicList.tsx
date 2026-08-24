import CheckIcon from '@cherrystudio/app-icons/icons/check';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, type AccessibilityActionEvent, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import Animated, { FadeInLeft, FadeOutLeft } from 'react-native-reanimated';

import { ContextMenuLink, type ContextMenuLinkItem } from '@/frontend/components/navigation';
import {
  useListBottomInset,
  usePendingDeletionIds,
  useRegisterSelectionSource,
  useSelectionActions,
  useSelectionState,
} from '@/frontend/components/selection';
import { useAssistantsApi } from '@/frontend/hooks/chat';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import type { TopicListItem } from '@/shared/data/api/schemas/topics';
import type { Assistant } from '@/shared/data/types/assistant';
import type { Topic } from '@/shared/data/types/topic';

import { useTopicActionAlerts } from './components/useTopicActionAlerts';
import {
  TopicListProvider,
  useTopicListActions,
  useTopicListTopics,
} from './context/TopicListProvider';
import { useTopicListInitialData } from './hooks/useTopicListInitialData';
import { useTopicSelectionSource } from './hooks/useTopicSelectionSource';

type TopicRowProps = {
  assistant?: Assistant;
  isEditing: boolean;
  isSelected: boolean;
  onDelete: (topic: Topic) => void;
  onRename: (topic: Topic) => void;
  onToggle: (topicId: string) => void;
  topic: TopicListItem;
};

const TOPIC_ITEM_ESTIMATED_HEIGHT = 60;

function topicKeyExtractor(item: TopicListItem) {
  return item.id;
}

function isSameCalendarDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatTopicUpdatedAt(updatedAt: string, locale: string | undefined, yesterday: string) {
  const updatedDate = new Date(updatedAt);
  const today = new Date();
  const yesterdayDate = new Date(today);
  yesterdayDate.setDate(today.getDate() - 1);

  const time = updatedDate.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isSameCalendarDay(updatedDate, today)) {
    return time;
  }

  if (isSameCalendarDay(updatedDate, yesterdayDate)) {
    return `${yesterday} ${time}`;
  }

  return updatedDate.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'numeric',
    ...(updatedDate.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
  });
}

const TopicListView = memo(function TopicListView() {
  const { t } = useTranslation();
  const bottomInset = useListBottomInset();
  const { isTopicListLoading, topicQueryError, topics } = useTopicListTopics();
  const { loadMoreTopics } = useTopicListActions();
  const {
    assistants,
    error: assistantsQueryError,
    isLoading: isAssistantsLoading,
  } = useAssistantsApi();
  const primaryColor = useThemeColor('primary');
  const isInitialDataSettled = useTopicListInitialData({
    assistants: { error: assistantsQueryError, isLoading: isAssistantsLoading },
    topics: { error: topicQueryError, isLoading: isTopicListLoading },
  });
  const initialLoadError = topicQueryError ?? assistantsQueryError;
  const { toggleId } = useSelectionActions();
  const { isEditing, selectedIds } = useSelectionState();
  const pendingDeletionIds = usePendingDeletionIds('conversations');
  const selectionSource = useTopicSelectionSource();
  useRegisterSelectionSource('conversations', selectionSource);
  const { requestDelete, requestRename } = useTopicActionAlerts();
  // Bottom inset is stable across the edit⇄done flip (see useListBottomInset),
  // so this style reference stays put and the list never reflows on toggle.
  const contentContainerStyle = useMemo(
    () => ({ paddingBottom: bottomInset, paddingHorizontal: 8 }),
    [bottomInset],
  );
  const visibleTopics = useMemo(
    () =>
      pendingDeletionIds.size === 0
        ? topics
        : topics.filter((topic) => !pendingDeletionIds.has(topic.id)),
    [pendingDeletionIds, topics],
  );
  const listExtraData = useMemo(() => ({ isEditing, selectedIds }), [isEditing, selectedIds]);
  const assistantsById = useMemo(
    () => new Map(assistants.map((assistant) => [assistant.id, assistant])),
    [assistants],
  );

  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<TopicListItem>) => (
      <TopicRow
        assistant={item.assistantId ? assistantsById.get(item.assistantId) : undefined}
        isEditing={isEditing}
        isSelected={selectedIds.has(item.id)}
        onDelete={requestDelete}
        onRename={requestRename}
        onToggle={toggleId}
        topic={item}
      />
    ),
    [assistantsById, isEditing, requestDelete, requestRename, selectedIds, toggleId],
  );

  // Loading stays inside ListEmptyComponent so the list mounts on the first
  // frame: a loading-gate sibling tree would mount the scroll view only after
  // the push settles, and `automatic` would resolve a zero top inset under the
  // transparent header.
  const listEmptyComponent = useCallback(
    () =>
      isInitialDataSettled ? (
        <View className="items-center justify-center px-6 py-8">
          <Text className="text-center text-foreground text-sm">
            {t(initialLoadError ? 'navigation.chatsLoadFailed' : 'navigation.noMatchingChats')}
          </Text>
        </View>
      ) : (
        <View className="items-center justify-center px-6 py-8">
          <ActivityIndicator color={primaryColor} />
        </View>
      ),
    [initialLoadError, isInitialDataSettled, primaryColor, t],
  );

  return (
    <View className="flex-1">
      <LegendList
        className="flex-1 bg-background"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={contentContainerStyle}
        data={isInitialDataSettled ? visibleTopics : []}
        estimatedItemSize={TOPIC_ITEM_ESTIMATED_HEIGHT}
        extraData={listExtraData}
        keyExtractor={topicKeyExtractor}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={listEmptyComponent}
        onEndReached={loadMoreTopics}
        onEndReachedThreshold={0.7}
        recycleItems
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
});

// The list owns its data provider so hosts (the topic management screen, or
// anything else embedding the list) never touch topic state directly.
type TopicListProps = {
  searchText?: string;
};

export function TopicList({ searchText = '' }: TopicListProps) {
  return (
    <TopicListProvider searchText={searchText}>
      <TopicListView />
    </TopicListProvider>
  );
}

const TopicRow = memo(function TopicRow({
  assistant,
  isEditing,
  isSelected,
  onDelete,
  onRename,
  onToggle,
  topic,
}: TopicRowProps) {
  const { i18n, t } = useTranslation();
  const updatedAtLabel = formatTopicUpdatedAt(
    topic.updatedAt,
    i18n.resolvedLanguage,
    t('topic.updatedAt.yesterday'),
  );
  const latestMessageText = topic.latestMessageText.replace(/\s+/g, ' ').trim();

  const handleRenamePress = useCallback(() => {
    onRename(topic);
  }, [onRename, topic]);
  const handleDeletePress = useCallback(() => {
    onDelete(topic);
  }, [onDelete, topic]);
  const accessibilityActions = useMemo(
    () =>
      isEditing
        ? [{ name: 'activate' as const }]
        : [
            { label: t('common.rename'), name: 'rename' as const },
            { label: t('common.delete'), name: 'delete' as const },
          ],
    [isEditing, t],
  );
  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (isEditing) {
        onToggle(topic.id);
        return;
      }

      switch (event.nativeEvent.actionName) {
        case 'rename':
          handleRenamePress();
          break;
        case 'delete':
          handleDeletePress();
          break;
        default:
          break;
      }
    },
    [handleDeletePress, handleRenamePress, isEditing, onToggle, topic.id],
  );
  const href = useMemo(
    () => ({ pathname: '/' as const, params: { topicId: topic.id } }),
    [topic.id],
  );
  const menuItems = useMemo<readonly ContextMenuLinkItem[]>(
    () => [
      {
        id: 'rename',
        label: t('common.rename'),
        onPress: handleRenamePress,
      },
      {
        id: 'delete',
        label: t('common.delete'),
        onPress: handleDeletePress,
        destructive: true,
      },
    ],
    [handleDeletePress, handleRenamePress, t],
  );

  const row = (
    <Pressable
      accessibilityActions={accessibilityActions}
      accessibilityLabel={topic.name || t('navigation.newChat')}
      accessibilityRole={isEditing ? 'checkbox' : 'link'}
      accessibilityState={isEditing ? { checked: isSelected } : undefined}
      className="w-full active:bg-secondary"
      onAccessibilityAction={handleAccessibilityAction}
      onPress={isEditing ? () => onToggle(topic.id) : undefined}
    >
      <View className="relative min-w-0 flex-1 flex-row items-center gap-2 border-border border-b bg-transparent py-2 pl-2">
        {isEditing ? (
          <Animated.View entering={FadeInLeft.duration(160)} exiting={FadeOutLeft.duration(120)}>
            <View
              className={
                isSelected
                  ? 'size-6 items-center justify-center rounded-full bg-foreground'
                  : 'size-6 items-center justify-center rounded-full border-2 border-border-strong'
              }
            >
              {isSelected ? <CheckIcon className="size-4 text-background" /> : null}
            </View>
          </Animated.View>
        ) : null}
        <Text className="min-w-12 text-center" style={{ fontSize: 32, lineHeight: 44 }}>
          {assistant?.emoji ?? '💬'}
        </Text>
        <View className="min-w-0 flex-1 pr-4">
          <View className="gap-0.5">
            <View className="min-w-0 flex-row items-center gap-2">
              <Text
                className="min-w-0 flex-1 font-semibold text-foreground text-base"
                numberOfLines={1}
              >
                {topic.name || t('navigation.newChat')}
              </Text>
              <Text className="text-foreground-tertiary text-xs" numberOfLines={1}>
                {updatedAtLabel}
              </Text>
            </View>
            <Text className="text-foreground-tertiary text-xs" numberOfLines={1}>
              {latestMessageText}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );

  return isEditing ? (
    row
  ) : (
    <ContextMenuLink href={href} items={menuItems}>
      {row}
    </ContextMenuLink>
  );
});
