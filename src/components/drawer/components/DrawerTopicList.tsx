import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { cn } from 'heroui-native/utils';
import { PencilIcon, Trash2Icon } from 'lucide-uniwind/png';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import type { Topic } from '@/data/types/topic';

import { useDrawerActions, useDrawerPanelState, useDrawerTopics } from '../context/DrawerProvider';
import { drawerContentLayoutTransition, drawerFeatureAreaEntering } from '../utils/drawerAnimation';

import { DrawerFeatureArea } from './DrawerFeatureArea';
import { DrawerNewChatButton } from './DrawerNewChatButton';
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
const newChatButtonClearance = 80;

export const DrawerTopicList = memo(function DrawerTopicList() {
  const { t } = useTranslation();
  const { isSearchActive } = useDrawerPanelState();
  const { activeTopicId, isTopicListLoading, topics } = useDrawerTopics();
  const { loadMoreTopics, openTopic } = useDrawerActions();
  const { dialogs, requestDelete, requestRename } = useDrawerTopicActionDialogs();

  const containerRef = useRef<View>(null);
  const isMountedRef = useRef(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [menuTopic, setMenuTopic] = useState<Topic | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const listExtraData = useMemo<DrawerTopicListExtraData>(
    () => ({
      activeTopicId,
      showActiveBackground: !isSearchActive,
    }),
    [activeTopicId, isSearchActive],
  );

  const handleRowLongPress = useCallback((rowRef: React.RefObject<View | null>, topic: Topic) => {
    rowRef.current?.measureInWindow((rx, ry, rw, rh) => {
      containerRef.current?.measureInWindow((cx, cy, _cw, _ch) => {
        if (!isMountedRef.current) {
          return;
        }
        const localX = rx - cx;
        const localY = ry - cy;
        const x = localX + Math.min(rw - menuWidth - 8, Math.max(8, rw / 2 - menuWidth / 2));
        const below = localY + rh + menuHeight + 8 <= _ch;
        const menuY = below ? localY + rh + 4 : localY - menuHeight - 4;
        setMenuPos({ x, y: menuY });
        setMenuTopic(topic);
        setMenuVisible(true);
      });
    });
  }, []);

  const closeMenu = useCallback(() => {
    setMenuVisible(false);
    setMenuTopic(null);
  }, []);

  const handleRename = useCallback(() => {
    const topic = menuTopic;
    closeMenu();
    if (topic) {
      requestRename(topic);
    }
  }, [menuTopic, requestRename, closeMenu]);

  const handleDelete = useCallback(() => {
    const topic = menuTopic;
    closeMenu();
    if (topic) {
      requestDelete(topic);
    }
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
    <View ref={containerRef} className="flex-1">
      <LegendList
        contentContainerStyle={{ paddingBottom: newChatButtonClearance, paddingTop: 2 }}
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
              <Text className="px-5 pt-3 pb-1 font-medium text-foreground-secondary text-sm">
                {t('navigation.recents')}
              </Text>
            </Animated.View>
          )
        }
        onEndReached={loadMoreTopics}
        onEndReachedThreshold={0.7}
        pointerEvents={menuVisible ? 'none' : undefined}
        recycleItems
        renderItem={renderItem}
      />
      {isSearchActive ? null : <DrawerNewChatButton />}
      {dialogs}

      {menuVisible && (
        <>
          <Pressable
            accessibilityLabel={t('common.close')}
            className="absolute inset-0 z-40"
            onPress={closeMenu}
          />
          <View
            accessibilityRole="menu"
            className="absolute z-50 w-44 overflow-hidden rounded-xl bg-overlay shadow-lg"
            style={{ top: menuPos.y, left: menuPos.x }}
          >
            <Pressable
              accessibilityRole="menuitem"
              className="flex-row items-center gap-3 px-4 py-3 active:opacity-60"
              onPress={handleRename}
            >
              <PencilIcon className="size-4 text-foreground" />
              <Text className="text-sm text-foreground">{t('common.rename')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="menuitem"
              className="flex-row items-center gap-3 px-4 py-3 active:opacity-60"
              onPress={handleDelete}
            >
              <Trash2Icon className="size-4 text-danger" />
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
