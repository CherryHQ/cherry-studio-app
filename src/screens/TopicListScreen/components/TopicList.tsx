import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { PencilIcon, Trash2Icon } from 'lucide-uniwind/png';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useBottomTabBarHeight } from 'react-native-bottom-tabs';

import type { Topic } from '@/data/types/topic';

import { useTopicListActions, useTopicListTopics } from '../context/TopicListProvider';
import { PopupMenu, type PopupMenuItem } from './PopupMenu';
import { useTopicActionDialogs } from './TopicActionDialogs';

type TopicRowProps = {
  onPress: (topicId: string) => void;
  onLongPress: (ref: React.RefObject<View | null>, topic: Topic) => void;
  topic: Topic;
};

const topicItemHeight = 44;

function topicKeyExtractor(item: Topic) {
  return item.id;
}

export const TopicList = memo(function TopicList() {
  const { t } = useTranslation();
  const tabBarHeight = useBottomTabBarHeight();
  const { isTopicListLoading, topics } = useTopicListTopics();
  const { loadMoreTopics, openTopic } = useTopicListActions();
  const { dialogs, requestDelete, requestRename } = useTopicActionDialogs();
  const containerRef = useRef<View>(null);
  const menuAnchorRef = useRef<View | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuTopic, setMenuTopic] = useState<Topic | null>(null);
  const contentContainerStyle = useMemo(
    () => ({
      paddingBottom: tabBarHeight,
    }),
    [tabBarHeight],
  );

  const handleRowLongPress = useCallback((rowRef: React.RefObject<View | null>, topic: Topic) => {
    menuAnchorRef.current = rowRef.current;
    setMenuTopic(topic);
    setMenuVisible(true);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuVisible(false);
    setMenuTopic(null);
    menuAnchorRef.current = null;
  }, []);

  const handleRename = useCallback(() => {
    const topic = menuTopic;
    closeMenu();
    if (topic) {
      requestRename(topic);
    }
  }, [closeMenu, menuTopic, requestRename]);

  const handleDelete = useCallback(() => {
    const topic = menuTopic;
    closeMenu();
    if (topic) {
      requestDelete(topic);
    }
  }, [closeMenu, menuTopic, requestDelete]);

  const menuItems = useMemo<PopupMenuItem[]>(
    () => [
      {
        id: 'rename',
        icon: <PencilIcon className="size-4 text-foreground" />,
        label: t('common.rename'),
        onPress: handleRename,
      },
      {
        id: 'delete',
        icon: <Trash2Icon className="size-4 text-danger" />,
        label: t('common.delete'),
        destructive: true,
        onPress: handleDelete,
      },
    ],
    [handleDelete, handleRename, t],
  );

  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<Topic>) => (
      <TopicRow onLongPress={handleRowLongPress} onPress={openTopic} topic={item} />
    ),
    [handleRowLongPress, openTopic],
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
    <>
      <LegendList
        className="flex-1 bg-background"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={contentContainerStyle}
        data={topics}
        estimatedItemSize={topicItemHeight}
        keyExtractor={topicKeyExtractor}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={listEmptyComponent}
        onEndReached={loadMoreTopics}
        onEndReachedThreshold={0.7}
        recycleItems
        renderItem={renderItem}
      />
      <View pointerEvents="box-none" ref={containerRef} style={styles.overlay}>
        {dialogs}
        <PopupMenu
          anchorRef={menuAnchorRef}
          closeAccessibilityLabel={t('common.close')}
          containerRef={containerRef}
          items={menuItems}
          visible={menuVisible}
          onClose={closeMenu}
        />
      </View>
    </>
  );
});

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
  },
});

const TopicRow = memo(function TopicRow({ onPress, onLongPress, topic }: TopicRowProps) {
  const rowRef = useRef<View>(null);

  const handlePress = useCallback(() => {
    onPress(topic.id);
  }, [onPress, topic.id]);

  const handleLongPress = useCallback(() => {
    onLongPress(rowRef, topic);
  }, [onLongPress, topic]);

  return (
    <Pressable
      ref={rowRef}
      accessibilityLabel={topic.name}
      accessibilityRole="button"
      className="mx-2 justify-center rounded-lg px-3 active:bg-surface active:opacity-70"
      onLongPress={handleLongPress}
      onPress={handlePress}
      style={{ height: topicItemHeight }}
    >
      <Text className="font-medium text-base text-default-foreground" numberOfLines={1}>
        {topic.name}
      </Text>
    </Pressable>
  );
});
