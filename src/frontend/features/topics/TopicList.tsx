import { CheckIcon } from '@cherrystudio/app-icons';
import type { TopicListItem } from '@cherrystudio/universal/data/api/schemas/topics';
import type { Assistant } from '@cherrystudio/universal/data/types/assistant';
import type { Topic } from '@cherrystudio/universal/data/types/topic';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { type AccessibilityActionEvent, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import Animated, { FadeInLeft, FadeOutLeft } from 'react-native-reanimated';

import { useAlert } from '@/frontend/components/AlertProvider';
import {
  useMessageListBottomInset,
  useMessagePendingDeletionIds,
  useMessageSelectionActions,
  useMessageSelectionState,
  useRegisterSelectionSource,
} from '@/frontend/components/messageTabs';
import { ContextMenuLink, type ContextMenuLinkItem } from '@/frontend/components/navigation';
import { useAssistantsApi } from '@/frontend/hooks/chat';

import { useTopicActionAlerts } from './components/useTopicActionAlerts';
import {
  TopicListProvider,
  useTopicListActions,
  useTopicListTopics,
} from './context/TopicListProvider';
import { useTopicSelectionSource } from './hooks/useTopicSelectionSource';

type TopicRowProps = {
  assistant?: Assistant;
  isEditing: boolean;
  isPinActionDisabled: boolean;
  isPinned: boolean;
  isSelected: boolean;
  onDelete: (topic: Topic) => void;
  onRename: (topic: Topic) => void;
  onTogglePin: (topicId: string) => void;
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
  const { alert } = useAlert();
  const bottomInset = useMessageListBottomInset();
  const { isPinActionDisabled, isTopicListLoading, pinnedTopicIds, topics } = useTopicListTopics();
  const { loadMoreTopics, toggleTopicPin } = useTopicListActions();
  const { assistants } = useAssistantsApi();
  const { toggleId } = useMessageSelectionActions();
  const { isEditing, selectedIds } = useMessageSelectionState();
  const pendingDeletionIds = useMessagePendingDeletionIds('conversations');
  const selectionSource = useTopicSelectionSource();
  useRegisterSelectionSource('conversations', selectionSource);
  const { requestDelete, requestRename } = useTopicActionAlerts();
  // Bottom inset is stable across the edit⇄done flip (see useMessageListBottomInset),
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
  const listExtraData = useMemo(
    () => ({ isEditing, isPinActionDisabled, pinnedTopicIds, selectedIds }),
    [isEditing, isPinActionDisabled, pinnedTopicIds, selectedIds],
  );
  const assistantsById = useMemo(
    () => new Map(assistants.map((assistant) => [assistant.id, assistant])),
    [assistants],
  );
  const pinnedTopicIdSet = useMemo(() => new Set(pinnedTopicIds), [pinnedTopicIds]);
  const handleTogglePin = useCallback(
    (topicId: string) => {
      void toggleTopicPin(topicId).catch(() => {
        alert.show({ title: t('topic.pin.failed') });
      });
    },
    [alert, t, toggleTopicPin],
  );

  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<TopicListItem>) => (
      <TopicRow
        assistant={item.assistantId ? assistantsById.get(item.assistantId) : undefined}
        isEditing={isEditing}
        isPinActionDisabled={isPinActionDisabled}
        isPinned={pinnedTopicIdSet.has(item.id)}
        isSelected={selectedIds.has(item.id)}
        onDelete={requestDelete}
        onRename={requestRename}
        onTogglePin={handleTogglePin}
        onToggle={toggleId}
        topic={item}
      />
    ),
    [
      assistantsById,
      handleTogglePin,
      isEditing,
      isPinActionDisabled,
      pinnedTopicIdSet,
      requestDelete,
      requestRename,
      selectedIds,
      toggleId,
    ],
  );

  const listEmptyComponent = useCallback(
    () => (
      <View className="items-center justify-center px-6 py-8">
        {isTopicListLoading ? null : (
          <Text className="text-center text-foreground text-sm">
            {t('navigation.noMatchingChats')}
          </Text>
        )}
      </View>
    ),
    [isTopicListLoading, t],
  );

  return (
    <View className="flex-1">
      <LegendList
        className="flex-1 bg-background"
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={contentContainerStyle}
        data={visibleTopics}
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

// The topics tab owns its data provider so the messages shell can host it as a
// pluggable tab without knowing anything about topic state.
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
  isPinActionDisabled,
  isPinned,
  isSelected,
  onDelete,
  onRename,
  onTogglePin,
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
  const handlePinPress = useCallback(() => {
    if (isPinActionDisabled) {
      return;
    }

    onTogglePin(topic.id);
  }, [isPinActionDisabled, onTogglePin, topic.id]);
  const pinActionLabel = t(isPinned ? 'topic.actions.unpin' : 'topic.actions.pin');
  const accessibilityActions = useMemo(() => {
    if (isEditing) {
      return [{ name: 'activate' as const }];
    }

    const actions = [
      { label: t('common.rename'), name: 'rename' as const },
      { label: t('common.delete'), name: 'delete' as const },
    ];

    return isPinActionDisabled
      ? actions
      : [...actions, { label: pinActionLabel, name: 'toggle-pin' as const }];
  }, [isEditing, isPinActionDisabled, pinActionLabel, t]);
  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (isEditing) {
        onToggle(topic.id);
        return;
      }

      switch (event.nativeEvent.actionName) {
        case 'toggle-pin':
          handlePinPress();
          break;
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
    [handleDeletePress, handlePinPress, handleRenamePress, isEditing, onToggle, topic.id],
  );
  const href = useMemo(
    () => ({ pathname: '/topics' as const, params: { topicId: topic.id } }),
    [topic.id],
  );
  const menuItems = useMemo<readonly ContextMenuLinkItem[]>(
    () => [
      {
        id: 'rename',
        label: t('common.rename'),
        onPress: handleRenamePress,
        systemImage: 'pencil',
      },
      {
        disabled: isPinActionDisabled,
        id: 'toggle-pin',
        checked: isPinned,
        label: pinActionLabel,
        onPress: handlePinPress,
        systemImage: isPinned ? 'pin.slash' : 'pin',
      },
      {
        id: 'delete',
        label: t('common.delete'),
        onPress: handleDeletePress,
        destructive: true,
        systemImage: 'trash',
      },
    ],
    [
      handleDeletePress,
      handlePinPress,
      handleRenamePress,
      isPinActionDisabled,
      isPinned,
      pinActionLabel,
      t,
    ],
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
      <View
        className={
          isPinned
            ? 'relative min-w-0 flex-1 flex-row items-center gap-2 border-border border-b bg-secondary py-2 pl-2'
            : 'relative min-w-0 flex-1 flex-row items-center gap-2 border-border border-b bg-transparent py-2 pl-2'
        }
      >
        {isEditing ? (
          <Animated.View entering={FadeInLeft.duration(160)} exiting={FadeOutLeft.duration(120)}>
            <View
              className={
                isSelected
                  ? 'size-6 items-center justify-center rounded-full bg-primary'
                  : 'size-6 items-center justify-center rounded-full border-2 border-border-strong'
              }
            >
              {isSelected ? <CheckIcon className="size-4 text-primary-foreground" /> : null}
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
