import type { Assistant } from '@cherrystudio/universal/data/types/assistant';
import type { Topic } from '@cherrystudio/universal/data/types/topic';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { useToast } from 'heroui-native/toast';
import { CheckIcon, PencilIcon, PinIcon, PinOffIcon, Trash2Icon } from 'lucide-uniwind/png';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { type AccessibilityActionEvent, Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  FadeInLeft,
  FadeOutLeft,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import {
  useMessageListBottomInset,
  useMessagePendingDeletionIds,
  useMessageSelectionActions,
  useMessageSelectionState,
  useRegisterSelectionSource,
} from '@/frontend/components/messageTabs';
import { useAssistantsApi } from '@/frontend/hooks/chat';
import { useExclusiveSwipeable } from '@/frontend/hooks/useExclusiveSwipeable';

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
  isLast: boolean;
  isSelected: boolean;
  notifyClose: (swipeable: SwipeableMethods) => void;
  notifyWillOpen: (swipeable: SwipeableMethods) => void;
  onDelete: (topic: Topic) => void;
  onPress: (topicId: string) => void;
  onRename: (topic: Topic) => void;
  onTogglePin: (topicId: string) => void;
  onToggle: (topicId: string) => void;
  topic: Topic;
};

const TOPIC_ITEM_ESTIMATED_HEIGHT = 60;
const TOPIC_LEFT_ACTION_WIDTH = 64;
const TOPIC_RIGHT_ACTIONS_WIDTH = 128;
const TOPIC_ROW_MAX_TAP_DISTANCE = 8;

function topicKeyExtractor(item: Topic) {
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
  const { toast } = useToast();
  const bottomInset = useMessageListBottomInset();
  const { isPinActionDisabled, isTopicListLoading, pinnedTopicIds, topics } = useTopicListTopics();
  const { loadMoreTopics, openTopic, toggleTopicPin } = useTopicListActions();
  const { assistants } = useAssistantsApi();
  const { toggleId } = useMessageSelectionActions();
  const { isEditing, selectedIds } = useMessageSelectionState();
  const pendingDeletionIds = useMessagePendingDeletionIds('conversations');
  const selectionSource = useTopicSelectionSource();
  useRegisterSelectionSource('conversations', selectionSource);
  const { requestDelete, requestRename } = useTopicActionAlerts();
  const { closeOpen, notifyClose, notifyWillOpen } = useExclusiveSwipeable();
  useEffect(() => {
    if (isEditing) {
      closeOpen();
    }
  }, [closeOpen, isEditing]);
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
        toast.show({ label: t('topic.pin.failed'), variant: 'danger' });
      });
    },
    [t, toast, toggleTopicPin],
  );

  const renderItem = useCallback(
    ({ index, item }: LegendListRenderItemProps<Topic>) => (
      <TopicRow
        assistant={item.assistantId ? assistantsById.get(item.assistantId) : undefined}
        isEditing={isEditing}
        isPinActionDisabled={isPinActionDisabled}
        isPinned={pinnedTopicIdSet.has(item.id)}
        isLast={index === visibleTopics.length - 1}
        isSelected={selectedIds.has(item.id)}
        notifyClose={notifyClose}
        notifyWillOpen={notifyWillOpen}
        onDelete={requestDelete}
        onPress={openTopic}
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
      notifyClose,
      notifyWillOpen,
      openTopic,
      pinnedTopicIdSet,
      requestDelete,
      requestRename,
      selectedIds,
      toggleId,
      visibleTopics.length,
    ],
  );

  const listEmptyComponent = useCallback(
    () => (
      <View className="items-center justify-center px-6 py-8">
        {isTopicListLoading ? null : (
          <Text className="text-center text-default-foreground text-sm">
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
  isLast,
  isSelected,
  notifyClose,
  notifyWillOpen,
  onDelete,
  onPress,
  onRename,
  onTogglePin,
  onToggle,
  topic,
}: TopicRowProps) {
  const { i18n, t } = useTranslation();
  const swipeableRef = useRef<SwipeableMethods>(null);
  const isSwipeOpen = useSharedValue(0);
  const pressProgress = useSharedValue(0);
  const updatedAtLabel = formatTopicUpdatedAt(
    topic.updatedAt,
    i18n.resolvedLanguage,
    t('topic.updatedAt.yesterday'),
  );

  const handlePress = useCallback(() => {
    if (isEditing) {
      onToggle(topic.id);
      return;
    }

    onPress(topic.id);
  }, [isEditing, onPress, onToggle, topic.id]);
  const handleRenamePress = useCallback(() => {
    swipeableRef.current?.close();
    onRename(topic);
  }, [onRename, topic]);
  const handleDeletePress = useCallback(() => {
    swipeableRef.current?.close();
    onDelete(topic);
  }, [onDelete, topic]);
  const handlePinPress = useCallback(() => {
    if (isPinActionDisabled) {
      return;
    }

    swipeableRef.current?.close();
    onTogglePin(topic.id);
  }, [isPinActionDisabled, onTogglePin, topic.id]);
  const handleSwipeableWillOpen = useCallback(() => {
    isSwipeOpen.value = 1;
  }, [isSwipeOpen]);
  const handleSwipeableClose = useCallback(() => {
    isSwipeOpen.value = 0;
    if (swipeableRef.current) {
      notifyClose(swipeableRef.current);
    }
  }, [isSwipeOpen, notifyClose]);
  // Fires the instant a drag starts opening this row (before release), so the
  // previously open row starts closing immediately instead of waiting for
  // this swipe to finish settling.
  const handleSwipeableOpenStartDrag = useCallback(() => {
    if (swipeableRef.current) {
      notifyWillOpen(swipeableRef.current);
    }
  }, [notifyWillOpen]);
  const openTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDistance(TOPIC_ROW_MAX_TAP_DISTANCE)
        .onBegin(() => {
          pressProgress.value = 1;
        })
        .onFinalize(() => {
          pressProgress.value = 0;
        })
        .onEnd((_event, success) => {
          if (success && isSwipeOpen.value === 0) {
            runOnJS(handlePress)();
          }
        }),
    [handlePress, isSwipeOpen, pressProgress],
  );
  const pressedBackgroundStyle = useAnimatedStyle(() => ({
    opacity: pressProgress.value,
  }));
  const borderStyle = useAnimatedStyle(() => ({
    opacity: 1 - pressProgress.value,
  }));
  const pinActionLabel = t(isPinned ? 'topic.actions.unpin' : 'topic.actions.pin');
  const accessibilityActions = useMemo(() => {
    if (isEditing) {
      return [{ name: 'activate' as const }];
    }

    const actions = [
      { name: 'activate' as const },
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
        handlePress();
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
          handlePress();
      }
    },
    [handleDeletePress, handlePinPress, handlePress, handleRenamePress, isEditing],
  );
  const renderLeftActions = useCallback(
    (_progress: SharedValue<number>, drag: SharedValue<number>) => (
      <TopicPinAction
        disabled={isPinActionDisabled}
        drag={drag}
        isPinned={isPinned}
        label={pinActionLabel}
        onPress={handlePinPress}
      />
    ),
    [handlePinPress, isPinActionDisabled, isPinned, pinActionLabel],
  );
  const renderRightActions = useCallback(
    (_progress: SharedValue<number>, drag: SharedValue<number>) => (
      <TopicActions
        deleteLabel={t('common.delete')}
        drag={drag}
        onDelete={handleDeletePress}
        onRename={handleRenamePress}
        renameLabel={t('common.rename')}
      />
    ),
    [handleDeletePress, handleRenamePress, t],
  );

  return (
    <ReanimatedSwipeable
      enabled={!isEditing}
      friction={2}
      onSwipeableClose={handleSwipeableClose}
      onSwipeableOpenStartDrag={handleSwipeableOpenStartDrag}
      onSwipeableWillOpen={handleSwipeableWillOpen}
      overshootLeft={false}
      overshootRight={false}
      ref={swipeableRef}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      leftThreshold={TOPIC_LEFT_ACTION_WIDTH / 2}
      rightThreshold={TOPIC_RIGHT_ACTIONS_WIDTH / 2}
      simultaneousWithExternalGesture={openTapGesture}
    >
      <GestureDetector gesture={openTapGesture}>
        <View
          accessibilityActions={accessibilityActions}
          accessibilityLabel={topic.name || t('navigation.newChat')}
          accessibilityRole={isEditing ? 'checkbox' : 'button'}
          accessibilityState={isEditing ? { checked: isSelected } : undefined}
          accessible
          onAccessibilityAction={handleAccessibilityAction}
        >
          <View
            className={
              isPinned
                ? 'relative min-w-0 flex-1 flex-row items-center gap-2 bg-surface-secondary py-2 pl-2'
                : 'relative min-w-0 flex-1 flex-row items-center gap-2 bg-transparent py-2 pl-2'
            }
          >
            <Animated.View
              className="absolute inset-0 bg-settings-grouped-surface"
              pointerEvents="none"
              style={pressedBackgroundStyle}
            />
            <Animated.View
              className={
                isLast
                  ? isEditing
                    ? 'absolute inset-y-0 right-0 left-22 border-border border-y'
                    : 'absolute inset-y-0 right-0 left-14 border-border border-y'
                  : isEditing
                    ? 'absolute top-0 right-0 left-22 border-border border-t'
                    : 'absolute top-0 right-0 left-14 border-border border-t'
              }
              pointerEvents="none"
              style={borderStyle}
            />
            {isEditing ? (
              <Animated.View
                entering={FadeInLeft.duration(160)}
                exiting={FadeOutLeft.duration(120)}
              >
                <View
                  className={
                    isSelected
                      ? 'size-6 items-center justify-center rounded-full bg-primary'
                      : 'size-6 items-center justify-center rounded-full border-2 border-border-strong'
                  }
                >
                  {isSelected ? <CheckIcon className="size-4 text-white" strokeWidth={3} /> : null}
                </View>
              </Animated.View>
            ) : null}
            <Text className="min-w-12 text-center text-emoji-3xl">{assistant?.emoji ?? '💬'}</Text>
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
                  {assistant?.modelName ?? t('assistant.model.none')}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </GestureDetector>
    </ReanimatedSwipeable>
  );
});

type TopicActionsProps = {
  deleteLabel: string;
  drag: SharedValue<number>;
  onDelete: () => void;
  onRename: () => void;
  renameLabel: string;
};

function TopicActions({ deleteLabel, drag, onDelete, onRename, renameLabel }: TopicActionsProps) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.value + TOPIC_RIGHT_ACTIONS_WIDTH }],
  }));

  return (
    <Animated.View className="h-full w-32 flex-row" style={animatedStyle}>
      <Pressable
        accessibilityLabel={renameLabel}
        accessibilityRole="button"
        className="w-16 items-center justify-center bg-surface-secondary active:opacity-80"
        onPress={onRename}
      >
        <PencilIcon className="size-5 text-foreground" strokeWidth={2} />
      </Pressable>
      <Pressable
        accessibilityLabel={deleteLabel}
        accessibilityRole="button"
        className="w-16 items-center justify-center bg-danger active:opacity-80"
        onPress={onDelete}
      >
        <Trash2Icon className="size-5 text-danger-foreground" strokeWidth={2} />
      </Pressable>
    </Animated.View>
  );
}

type TopicPinActionProps = {
  disabled: boolean;
  drag: SharedValue<number>;
  isPinned: boolean;
  label: string;
  onPress: () => void;
};

function TopicPinAction({ disabled, drag, isPinned, label, onPress }: TopicPinActionProps) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.value - TOPIC_LEFT_ACTION_WIDTH }],
  }));

  return (
    <Animated.View className="h-full w-16" style={animatedStyle}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        className="h-full items-center justify-center bg-primary active:opacity-80 disabled:opacity-40"
        disabled={disabled}
        onPress={onPress}
      >
        {isPinned ? (
          <PinOffIcon className="size-5 text-white" strokeWidth={2} />
        ) : (
          <PinIcon className="size-5 text-white" strokeWidth={2} />
        )}
      </Pressable>
    </Animated.View>
  );
}
