import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { cn } from 'heroui-native/utils';
import { PencilIcon, Trash2Icon } from 'lucide-uniwind/png';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dimensions, Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import type { Topic } from '@/data/types/topic';

import { useDrawerActions, useDrawerPanelState, useDrawerTopics } from '../context/DrawerProvider';
import { drawerContentLayoutTransition, drawerFeatureAreaEntering } from '../utils/drawerAnimation';

import { DrawerFeatureArea } from './DrawerFeatureArea';
import { useDrawerTopicActionDialogs } from './DrawerTopicActionDialogs';

type DrawerTopicRowProps = {
  isActive: boolean;
  onPress: (topicId: string) => void;
  onLongPress: (ref: React.RefObject<View | null>, topic: Topic) => void;
  showActiveBackground: boolean;
  topic: Topic;
};

type DrawerTopicListExtraData = {
  activeTopicId?: string;
  showActiveBackground: boolean;
};

const topicItemHeight = 44;
const menuWidth = 176;
const menuHeight = 96;

export const DrawerTopicList = memo(function DrawerTopicList() {
  const { t } = useTranslation();
  const { isSearchActive } = useDrawerPanelState();
  const { activeTopicId, isTopicListLoading, topics } = useDrawerTopics();
  const { loadMoreTopics, openTopic } = useDrawerActions();
  const { dialogs, requestDelete, requestRename } = useDrawerTopicActionDialogs();

  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [menuTopic, setMenuTopic] = useState<Topic | null>(null);

  const listExtraData = useMemo<DrawerTopicListExtraData>(
    () => ({
      activeTopicId,
      showActiveBackground: !isSearchActive,
    }),
    [activeTopicId, isSearchActive],
  );

  const handleRowLongPress = useCallback((ref: React.RefObject<View | null>, topic: Topic) => {
    ref.current?.measure((_fx, _fy, width, height, _px, py) => {
      const x = Math.min(width - menuWidth - 8, Math.max(8, width / 2 - menuWidth / 2));
      const below = py + height + menuHeight + 8 <= Dimensions.get('window').height;
      const menuY = below ? py + height + 4 : py - menuHeight - 4;
      setMenuPos({ x, y: menuY });
      setMenuTopic(topic);
      setMenuVisible(true);
    });
  }, []);

  const closeMenu = useCallback(() => {
    setMenuVisible(false);
    setMenuTopic(null);
  }, []);

  const handleRename = useCallback(() => {
    if (menuTopic) {
      requestRename(menuTopic);
    }
    closeMenu();
  }, [menuTopic, requestRename, closeMenu]);

  const handleDelete = useCallback(() => {
    if (menuTopic) {
      requestDelete(menuTopic);
    }
    closeMenu();
  }, [menuTopic, requestDelete, closeMenu]);

  const renderItem = useCallback(
    ({ extraData, item }: LegendListRenderItemProps<Topic>) => (
      <DrawerTopicRow
        isActive={item.id === extraData.activeTopicId}
        onPress={openTopic}
        onLongPress={handleRowLongPress}
        showActiveBackground={extraData.showActiveBackground}
        topic={item}
      />
    ),
    [openTopic, handleRowLongPress],
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
        contentContainerStyle={{ paddingTop: 2 }}
        data={topics}
        estimatedItemSize={topicItemHeight}
        extraData={listExtraData}
        keyExtractor={(item) => item.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={listEmptyComponent}
        ListHeaderComponent={
          isSearchActive ? null : (
            <Animated.View
              entering={drawerFeatureAreaEntering}
              layout={drawerContentLayoutTransition}
            >
              <DrawerFeatureArea />
            </Animated.View>
          )
        }
        onEndReached={loadMoreTopics}
        onEndReachedThreshold={0.7}
        pointerEvents={menuVisible ? 'none' : undefined}
        recycleItems
        renderItem={renderItem}
      />
      {dialogs}

      {menuVisible && (
        <>
          <Pressable className="absolute inset-0 z-40" onPress={closeMenu} />
          <View
            className="absolute z-50 w-44 overflow-hidden rounded-xl bg-overlay shadow-lg"
            style={{ top: menuPos.y, left: menuPos.x }}
          >
            <Pressable
              className="flex-row items-center gap-3 px-4 py-3 active:opacity-60"
              onPress={handleRename}
            >
              <View className="text-foreground">
                <PencilIcon className="size-4" />
              </View>
              <Text className="text-sm text-foreground">{t('common.rename')}</Text>
            </Pressable>
            <Pressable
              className="flex-row items-center gap-3 border-b border-border px-4 py-3 active:opacity-60"
              onPress={handleDelete}
            >
              <View className="text-danger">
                <Trash2Icon className="size-4" />
              </View>
              <Text className="text-sm text-danger">{t('common.delete')}</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
});

const DrawerTopicRow = memo(function DrawerTopicRow({
  isActive,
  onPress,
  onLongPress,
  showActiveBackground,
  topic,
}: DrawerTopicRowProps) {
  const handlePress = useCallback(() => {
    onPress(topic.id);
  }, [onPress, topic.id]);

  const rowRef = useRef<View>(null);

  const handleLongPress = useCallback(() => {
    onLongPress(rowRef, topic);
  }, [onLongPress, topic]);

  return (
    <Pressable
      ref={rowRef}
      accessibilityLabel={topic.name}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      className={cn(
        'mx-2 justify-center rounded-lg px-3 active:opacity-70',
        isActive && showActiveBackground && 'bg-surface',
      )}
      onLongPress={handleLongPress}
      onPress={handlePress}
      style={{ height: topicItemHeight }}
    >
      <Text
        className={cn(
          'text-base',
          isActive ? 'font-semibold text-foreground' : 'font-medium text-default-foreground',
        )}
        numberOfLines={1}
      >
        {topic.name}
      </Text>
    </Pressable>
  );
});
