import { type MenuAction, MenuView, type NativeActionEvent } from '@expo/ui/community/menu';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { cn } from 'heroui-native/utils';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import type { Topic } from '@/data/types/topic';

import { useDrawerActions, useDrawerPanelState, useDrawerTopics } from '../context/DrawerProvider';

import { DrawerNewChatButton } from './DrawerNewChatButton';
import { useDrawerTopicActionDialogs } from './DrawerTopicActionDialogs';

type DrawerTopicRowProps = {
  isActive: boolean;
  onDelete: (topic: Topic) => void;
  onPress: (topicId: string) => void;
  onRename: (topic: Topic) => void;
  showActiveBackground: boolean;
  topic: Topic;
  width: number;
};

type DrawerTopicListExtraData = {
  activeTopicId?: string;
  rowWidth: number;
  showActiveBackground: boolean;
};

const topicItemHeight = 36;
// Horizontal inset that keeps each row's rounded highlight clear of the drawer
// edges (8pt per side); applied as the row's own padding so the row itself can
// take an explicit full width (see DrawerTopicRow for why the width is needed).
const rowHorizontalInset = 8;
// Bottom padding that lets the last rows scroll clear of the floating new-chat
// button instead of being permanently hidden behind it.
const newChatButtonClearance = 80;

export const DrawerTopicList = memo(function DrawerTopicList() {
  const { t } = useTranslation();
  const { isSearchActive } = useDrawerPanelState();
  const { activeTopicId, isTopicListLoading, topics } = useDrawerTopics();
  const { loadMoreTopics, openTopic } = useDrawerActions();
  const { dialogs, requestDelete, requestRename } = useDrawerTopicActionDialogs();
  const [rowWidth, setRowWidth] = useState(0);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setRowWidth(event.nativeEvent.layout.width);
  }, []);
  const listExtraData = useMemo<DrawerTopicListExtraData>(
    () => ({
      activeTopicId,
      rowWidth,
      showActiveBackground: !isSearchActive,
    }),
    [activeTopicId, isSearchActive, rowWidth],
  );

  const renderItem = useCallback(
    ({ extraData, item }: LegendListRenderItemProps<Topic>) => (
      <DrawerTopicRow
        isActive={item.id === extraData.activeTopicId}
        onDelete={requestDelete}
        onPress={openTopic}
        onRename={requestRename}
        showActiveBackground={extraData.showActiveBackground}
        topic={item}
        width={extraData.rowWidth}
      />
    ),
    [openTopic, requestDelete, requestRename],
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
    <View className="flex-1" onLayout={handleLayout}>
      <LegendList
        contentContainerStyle={{ paddingBottom: newChatButtonClearance, paddingTop: 2 }}
        data={topics}
        estimatedItemSize={topicItemHeight}
        extraData={listExtraData}
        keyExtractor={(item) => item.id}
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
    </View>
  );
});

const DrawerTopicRow = memo(function DrawerTopicRow({
  isActive,
  onDelete,
  onPress,
  onRename,
  showActiveBackground,
  topic,
  width,
}: DrawerTopicRowProps) {
  const { t } = useTranslation();
  const handlePress = useCallback(() => {
    onPress(topic.id);
  }, [onPress, topic.id]);

  const menuActions = useMemo<MenuAction[]>(
    () => [
      { id: 'rename', image: 'pencil', title: t('common.rename') },
      {
        attributes: { destructive: true },
        id: 'delete',
        image: 'trash',
        title: t('common.delete'),
      },
    ],
    [t],
  );

  const handlePressAction = useCallback(
    ({ nativeEvent }: NativeActionEvent) => {
      if (nativeEvent.event === 'rename') {
        onRename(topic);
      } else if (nativeEvent.event === 'delete') {
        onDelete(topic);
      }
    },
    [onDelete, onRename, topic],
  );

  return (
    // MenuView (iOS) hosts the trigger in a SwiftUI `Host matchContents`, which
    // sizes to the child's *intrinsic* width instead of stretching to the list
    // row. The Pressable therefore needs an explicit width (the measured list
    // width) so the row spans the drawer; the rounded highlight keeps its edge
    // inset via the inner view's horizontal margin.
    <MenuView actions={menuActions} onPressAction={handlePressAction} shouldOpenOnLongPress>
      <Pressable
        accessibilityLabel={topic.name}
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
        className="active:opacity-70"
        onPress={handlePress}
        style={{ height: topicItemHeight, width }}
      >
        <View
          className={cn(
            'flex-1 justify-center rounded-lg px-3',
            isActive && showActiveBackground && 'bg-surface-secondary',
          )}
          style={{ marginHorizontal: rowHorizontalInset }}
        >
          <Text
            className={cn(
              'font-medium text-base',
              isActive ? 'text-foreground' : 'text-default-foreground',
            )}
            numberOfLines={1}
          >
            {topic.name}
          </Text>
        </View>
      </Pressable>
    </MenuView>
  );
});
