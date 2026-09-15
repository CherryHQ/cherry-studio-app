import { ContextMenuScrollBoundary, ScrollToBottomButton } from '@cherrystudio/ui/components';
import { KeyboardAwareLegendList } from '@legendapp/list/keyboard';
import { type LegendListRef, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, View } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import {
  runOnJS,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';

import { MessageListDisclosureProvider } from './list/MessageListDisclosureContext';
import {
  getMessageRowType,
  isMessageListAtBottom,
  MAINTAIN_VISIBLE_CONTENT_POSITION,
  MESSAGE_LIST_TOP_PADDING,
  messageKeyExtractor,
} from './list/messageListLayout';
import { MessageListRow } from './list/MessageListRow';
import { useMessageListScrollController } from './list/useMessageListScrollController';
import type { MessageListItem, MessageListProps } from './types';

const SCROLL_BUTTON_GAP_ABOVE_ACCESSORY = 5;

export function MessageList({
  bottomAccessoryHeight,
  contentBottomInset,
  contentTopInset,
  dataKey,
  enteringMessageId,
  extraData,
  initialLayoutReady = true,
  initialScrollTarget,
  hasNewerMessages = false,
  keyboardOffset,
  keyboardShouldPersistTaps = 'handled',
  messages,
  onLoadOlder,
  onLoadNewer,
  onReturnToLatest,
  onReady,
  renderMessage,
}: MessageListProps) {
  const { t } = useTranslation();
  const listRef = useRef<LegendListRef | null>(null);
  const {
    handleContentSizeChange,
    handleDisclosureToggle,
    handleLayout,
    handleLoad,
    handleMomentumScrollBegin,
    handleMomentumScrollEnd,
    handleScroll,
    handleScrollBeginDrag,
    handleScrollEndDrag,
    handleScrollToEnd,
    handleTouchStart,
    isFollowing,
  } = useMessageListScrollController({
    contentTopInset,
    dataKey,
    enteringMessageId,
    initialLayoutReady,
    initialScrollTarget,
    hasNewerMessages,
    listRef,
    messages,
    onReady,
    onReturnToLatest,
  });
  const { height: keyboardHeight, progress: keyboardProgress } = useReanimatedKeyboardAnimation();
  const keyboardLift = useDerivedValue(() =>
    Math.max(0, -keyboardHeight.get() - keyboardProgress.get() * keyboardOffset),
  );
  const scrollButtonBottom = useDerivedValue(
    () => (bottomAccessoryHeight?.get() ?? 0) + keyboardLift.get(),
  );
  const contentHeight = useSharedValue({ dataKey, height: 0 });
  const viewportHeight = useSharedValue(0);
  const scrollOffset = useSharedValue(0);
  const [bottomState, setBottomState] = useState({ dataKey, isAtBottom: true });
  const syncScrollButtonVisibility = useCallback((key: string | undefined, isAtBottom: boolean) => {
    setBottomState({ dataKey: key, isAtBottom });
  }, []);
  const handleListContentSizeChange = useCallback(
    (_width: number, height: number) => {
      contentHeight.set({ dataKey, height });
      handleContentSizeChange();
    },
    [contentHeight, dataKey, handleContentSizeChange],
  );
  const handleListLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewportHeight.set(event.nativeEvent.layout.height);
      handleLayout(event);
    },
    [handleLayout, viewportHeight],
  );

  useAnimatedReaction(
    () => {
      const content = contentHeight.get();
      const viewport = viewportHeight.get();
      // Match the keyboard adapter's capped inset, including short conversations
      // that become scrollable only once the keyboard covers part of the list.
      const inset = Math.min(viewport, keyboardLift.get());
      return {
        dataKey,
        isAtBottom:
          content.dataKey !== dataKey ||
          viewport <= 0 ||
          isMessageListAtBottom(scrollOffset.get(), content.height + inset, viewport),
      };
    },
    (current, previous) => {
      if (
        previous === null ||
        current.dataKey !== previous.dataKey ||
        current.isAtBottom !== previous.isAtBottom
      ) {
        runOnJS(syncScrollButtonVisibility)(current.dataKey, current.isAtBottom);
      }
    },
  );

  const listHeader = useMemo(() => <View style={{ height: contentTopInset }} />, [contentTopInset]);
  const contentContainerStyle = useMemo(
    () => ({
      paddingBottom: contentBottomInset,
      paddingTop: MESSAGE_LIST_TOP_PADDING,
    }),
    [contentBottomInset],
  );
  const renderMessageRow = useCallback(
    ({ extraData: rowExtraData, item }: LegendListRenderItemProps<MessageListItem>) => (
      <MessageListRow extraData={rowExtraData} message={item} renderMessage={renderMessage} />
    ),
    [renderMessage],
  );
  const handleStartReached = useCallback(() => {
    if (!onLoadOlder) {
      return;
    }

    void onLoadOlder();
  }, [onLoadOlder]);
  const sharedValues = useMemo(() => ({ scrollOffset }), [scrollOffset]);
  const handleEndReached = useCallback(() => {
    void onLoadNewer?.();
  }, [onLoadNewer]);

  return (
    <MessageListDisclosureProvider onDisclosureToggle={handleDisclosureToggle}>
      <View className="flex-1" testID="chat-message-list">
        <ContextMenuScrollBoundary
          onMomentumScrollBegin={handleMomentumScrollBegin}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEndDrag}
          onTouchStart={handleTouchStart}
        >
          {(scrollHandlers) => (
            <KeyboardAwareLegendList
              ref={listRef}
              {...scrollHandlers}
              applyWorkaroundForContentInsetHitTestBug
              contentContainerStyle={contentContainerStyle}
              contentInsetAdjustmentBehavior="never"
              data={messages}
              {...(dataKey ? { dataKey } : {})}
              drawDistance={80}
              estimatedItemSize={300}
              estimatedHeaderSize={contentTopInset}
              extraData={extraData}
              getItemType={getMessageRowType}
              keyExtractor={messageKeyExtractor}
              keyboardDismissMode="none"
              keyboardLiftBehavior={isFollowing ? 'persistent' : 'never'}
              keyboardOffset={keyboardOffset}
              keyboardShouldPersistTaps={keyboardShouldPersistTaps}
              ListHeaderComponent={listHeader}
              {...(!dataKey ? { initialScrollAtEnd: true } : {})}
              maintainVisibleContentPosition={MAINTAIN_VISIBLE_CONTENT_POSITION}
              onContentSizeChange={handleListContentSizeChange}
              onLayout={handleListLayout}
              onLoad={handleLoad}
              onScroll={handleScroll}
              onStartReached={onLoadOlder ? handleStartReached : undefined}
              onStartReachedThreshold={0.05}
              onEndReached={hasNewerMessages ? handleEndReached : undefined}
              onEndReachedThreshold={0.3}
              // Message parts own local disclosure state. Keep recycling disabled
              // until that state is explicitly reset with LegendList recycling hooks.
              recycleItems={false}
              renderItem={renderMessageRow}
              scrollEventThrottle={16}
              scrollsToTop
              sharedValues={sharedValues}
              showsVerticalScrollIndicator={false}
              className="flex-1"
            />
          )}
        </ContextMenuScrollBoundary>
        {messages.length > 0 ? (
          <ScrollToBottomButton
            accessibilityLabel={t('chat.message.scrollToBottom')}
            bottomAccessoryHeight={scrollButtonBottom}
            gap={SCROLL_BUTTON_GAP_ABOVE_ACCESSORY}
            isAtBottom={
              !hasNewerMessages &&
              (isFollowing || bottomState.dataKey !== dataKey || bottomState.isAtBottom)
            }
            // The press only enters following mode, which already hides the
            // button. Mirroring an optimistic at-end state here would stick at
            // `true` whenever the scroll does not actually land at the end.
            onPress={handleScrollToEnd}
          />
        ) : null}
      </View>
    </MessageListDisclosureProvider>
  );
}
