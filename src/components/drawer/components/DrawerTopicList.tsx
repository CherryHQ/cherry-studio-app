import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { cn } from 'heroui-native/utils';
import { PencilIcon, Trash2Icon } from 'lucide-uniwind/png';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import type { Topic } from '@/data/types/topic';
import { useDrawerActions, useDrawerPanelState, useDrawerTopics } from '../context/DrawerProvider';
import { DrawerNewChatButton } from './DrawerNewChatButton';
import { useDrawerTopicActionDialogs } from './DrawerTopicActionDialogs';
import { PopupMenu, type PopupMenuItem } from './PopupMenu';

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
const newChatButtonClearance = 80;
const listContentContainerStyle = { paddingBottom: newChatButtonClearance, paddingTop: 2 };

function topicKeyExtractor(item: Topic) {
  return item.id;
}

export const DrawerTopicList = memo(function DrawerTopicList() {
  const { t } = useTranslation();
  const { isSearchActive } = useDrawerPanelState();
  const { activeTopicId, isTopicListLoading, topics } = useDrawerTopics();
  const { loadMoreTopics, openTopic } = useDrawerActions();
  const { dialogs, requestDelete, requestRename } = useDrawerTopicActionDialogs();

  const containerRef = useRef<View>(null);
  const menuAnchorRef = useRef<View | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuTopic, setMenuTopic] = useState<Topic | null>(null);

  const listExtraData = useMemo<DrawerTopicListExtraData>(
    () => ({
      activeTopicId,
      showActiveBackground: !isSearchActive,
    }),
    [activeTopicId, isSearchActive],
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
  }, [menuTopic, requestRename, closeMenu]);

  const handleDelete = useCallback(() => {
    const topic = menuTopic;
    closeMenu();
    if (topic) {
      requestDelete(topic);
    }
  }, [menuTopic, requestDelete, closeMenu]);

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
    [t, handleRename, handleDelete],
  );

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
        contentContainerStyle={listContentContainerStyle}
        data={topics}
        estimatedItemSize={topicItemHeight}
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
      {isSearchActive ? null : <DrawerNewChatButton />}
      {dialogs}

      <PopupMenu
        visible={menuVisible}
        anchorRef={menuAnchorRef}
        containerRef={containerRef}
        items={menuItems}
        onClose={closeMenu}
        closeAccessibilityLabel={t('common.close')}
      />
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
