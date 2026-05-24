import { KeyboardChatLegendList } from '@legendapp/list/keyboard-chat';
import { type LegendListRef, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollShadow } from 'heroui-native/scroll-shadow';
import { type RefObject, useCallback, useMemo } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, StyleSheet } from 'react-native';

import type { Message } from '@/data/types/message';

import { AssistantMessageItem, UserMessageItem } from '../../messageItem';
import { getMessageListScrollSignal } from '../utils/messageListScrollSignals';

type ChatMessageListProps = {
  contentBottomInset: number;
  listRef: RefObject<LegendListRef | null>;
  messages: readonly Message[];
  onLoad?: () => void;
  onLoadOlder: () => Promise<void>;
  onPrefetchOlder: () => void;
};

function renderMessageItem({ item }: LegendListRenderItemProps<Message>) {
  return item.role === 'user' ? (
    <UserMessageItem message={item} />
  ) : (
    <AssistantMessageItem message={item} />
  );
}

export function ChatMessageList({
  contentBottomInset,
  listRef,
  messages,
  onLoad,
  onLoadOlder,
  onPrefetchOlder,
}: ChatMessageListProps) {
  const handleStartReached = useCallback(() => {
    void onLoadOlder();
  }, [onLoadOlder]);

  const contentContainerStyle = useMemo(
    () => ({
      paddingBottom: contentBottomInset,
      paddingTop: 12,
    }),
    [contentBottomInset],
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { isNearStart } = getMessageListScrollSignal(event);

      if (isNearStart) {
        onPrefetchOlder();
      }
    },
    [onPrefetchOlder],
  );

  return (
    <ScrollShadow
      LinearGradientComponent={LinearGradient}
      style={styles.list}
      visibility="bottom"
      size={80}
    >
      <KeyboardChatLegendList
        ref={listRef}
        automaticallyAdjustsScrollIndicatorInsets
        contentContainerStyle={contentContainerStyle}
        contentInsetAdjustmentBehavior="automatic"
        data={messages}
        drawDistance={80}
        estimatedItemSize={300}
        initialScrollAtEnd
        keyExtractor={(item) => item.id}
        keyboardDismissMode="interactive"
        keyboardLiftBehavior="whenAtEnd"
        keyboardShouldPersistTaps="handled"
        maintainScrollAtEnd={{
          animated: false,
          on: {
            dataChange: true,
            itemLayout: true,
            layout: true,
          },
        }}
        maintainScrollAtEndThreshold={0.12}
        maintainVisibleContentPosition={{ data: true }}
        onLoad={onLoad}
        onScroll={handleScroll}
        onStartReached={handleStartReached}
        onStartReachedThreshold={0.15}
        recycleItems
        renderItem={renderMessageItem}
        scrollsToTop
        style={styles.list}
      />
    </ScrollShadow>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
});
