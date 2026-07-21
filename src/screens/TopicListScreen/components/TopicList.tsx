import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { PencilIcon, Trash2Icon } from 'lucide-uniwind/png';
import { memo, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { type AccessibilityActionEvent, Pressable, Text, View } from 'react-native';
import { useBottomTabBarHeight } from 'react-native-bottom-tabs';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import type { Assistant } from '@/data/types/assistant';
import type { Topic } from '@/data/types/topic';
import { useAssistantsApi } from '@/hooks/chat';

import { useTopicListActions, useTopicListTopics } from '../context/TopicListProvider';
import { useTopicActionDialogs } from './TopicActionDialogs';

type TopicRowProps = {
  assistant?: Assistant;
  isLast: boolean;
  onDelete: (topic: Topic) => void;
  onPress: (topicId: string) => void;
  onRename: (topic: Topic) => void;
  topic: Topic;
};

const TOPIC_ITEM_ESTIMATED_HEIGHT = 60;
const TOPIC_ACTIONS_WIDTH = 128;
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

export const TopicList = memo(function TopicList() {
  const { t } = useTranslation();
  const tabBarHeight = useBottomTabBarHeight();
  const { isTopicListLoading, topics } = useTopicListTopics();
  const { loadMoreTopics, openTopic } = useTopicListActions();
  const { assistants } = useAssistantsApi();
  const { dialogs, requestDelete, requestRename } = useTopicActionDialogs();
  const contentContainerStyle = useMemo(
    () => ({
      paddingBottom: tabBarHeight,
      paddingHorizontal: 8,
    }),
    [tabBarHeight],
  );
  const assistantsById = useMemo(
    () => new Map(assistants.map((assistant) => [assistant.id, assistant])),
    [assistants],
  );

  const renderItem = useCallback(
    ({ index, item }: LegendListRenderItemProps<Topic>) => (
      <TopicRow
        assistant={item.assistantId ? assistantsById.get(item.assistantId) : undefined}
        isLast={index === topics.length - 1}
        onDelete={requestDelete}
        onPress={openTopic}
        onRename={requestRename}
        topic={item}
      />
    ),
    [assistantsById, openTopic, requestDelete, requestRename, topics.length],
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
        style={{ flex: 1 }}
        className="bg-background"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={contentContainerStyle}
        data={topics}
        estimatedItemSize={TOPIC_ITEM_ESTIMATED_HEIGHT}
        keyExtractor={topicKeyExtractor}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={listEmptyComponent}
        onEndReached={loadMoreTopics}
        onEndReachedThreshold={0.7}
        recycleItems
        renderItem={renderItem}
      />
      {dialogs}
    </View>
  );
});

const TopicRow = memo(function TopicRow({
  assistant,
  isLast,
  onDelete,
  onPress,
  onRename,
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
    onPress(topic.id);
  }, [onPress, topic.id]);
  const handleRenamePress = useCallback(() => {
    swipeableRef.current?.close();
    onRename(topic);
  }, [onRename, topic]);
  const handleDeletePress = useCallback(() => {
    swipeableRef.current?.close();
    onDelete(topic);
  }, [onDelete, topic]);
  const handleSwipeableWillOpen = useCallback(() => {
    isSwipeOpen.value = 1;
  }, [isSwipeOpen]);
  const handleSwipeableClose = useCallback(() => {
    isSwipeOpen.value = 0;
  }, [isSwipeOpen]);
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
  const accessibilityActions = useMemo(
    () => [
      { name: 'activate' as const },
      { label: t('common.rename'), name: 'rename' as const },
      { label: t('common.delete'), name: 'delete' as const },
    ],
    [t],
  );
  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      switch (event.nativeEvent.actionName) {
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
    [handleDeletePress, handlePress, handleRenamePress],
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
      friction={2}
      onSwipeableClose={handleSwipeableClose}
      onSwipeableWillOpen={handleSwipeableWillOpen}
      overshootRight={false}
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={TOPIC_ACTIONS_WIDTH / 2}
      simultaneousWithExternalGesture={openTapGesture}
    >
      <GestureDetector gesture={openTapGesture}>
        <View
          accessibilityActions={accessibilityActions}
          accessibilityLabel={topic.name || t('navigation.newChat')}
          accessibilityRole="button"
          accessible
          onAccessibilityAction={handleAccessibilityAction}
        >
          <View className="relative min-w-0 flex-1 flex-row items-center gap-2 py-2 pl-2">
            <Animated.View
              className="absolute inset-0 bg-settings-grouped-surface"
              pointerEvents="none"
              style={pressedBackgroundStyle}
            />
            <Animated.View
              className={
                isLast
                  ? 'absolute inset-y-0 right-0 left-14 border-border border-y'
                  : 'absolute top-0 right-0 left-14 border-border border-t'
              }
              pointerEvents="none"
              style={borderStyle}
            />
            <Text className="min-w-12 h-12 text-center text-3xl leading-12">
              {assistant?.emoji ?? '💬'}
            </Text>
            <View className="min-w-0 flex-1 pr-4">
              <View className="gap-0.5">
                <View className="min-w-0 flex-row items-center gap-2">
                  <Text
                    className="min-w-0 flex-1 font-semibold text-foreground text-md"
                    numberOfLines={1}
                  >
                    {topic.name || t('navigation.newChat')}
                  </Text>
                  <Text className="text-foreground-muted text-xs" numberOfLines={1}>
                    {updatedAtLabel}
                  </Text>
                </View>
                <Text className="text-foreground-muted text-xs" numberOfLines={1}>
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
    transform: [{ translateX: drag.value + TOPIC_ACTIONS_WIDTH }],
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
