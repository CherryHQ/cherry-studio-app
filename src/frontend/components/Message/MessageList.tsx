import { ContextMenuScrollBoundary, ScrollToBottomButton } from '@cherrystudio/ui/components';
import { KeyboardAwareLegendList, useKeyboardScrollToEnd } from '@legendapp/list/keyboard';
import { type LegendListRef, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, Platform, View } from 'react-native';
import { runOnJS, useAnimatedReaction, useSharedValue } from 'react-native-reanimated';

import { MessageListDisclosureProvider } from './list/MessageListDisclosureContext';
import {
  getMessageRowType,
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
  keyboardOffset,
  messages,
  onLoadOlder,
  onReady,
  renderMessage,
}: MessageListProps) {
  const { t } = useTranslation();
  const listRef = useRef<LegendListRef | null>(null);
  const { freeze, scrollMessageToEnd } = useKeyboardScrollToEnd({ listRef });
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
    dataKey,
    enteringMessageId,
    initialLayoutReady,
    listRef,
    messages,
    onReady,
    scrollMessageToEnd,
  });
  const isAtBottom = useSharedValue(true);
  const contentHeightRef = useRef({ dataKey, height: 0 });
  const viewportHeightRef = useRef(0);
  const [contentScrollability, setContentScrollability] = useState({
    dataKey,
    isScrollable: false,
  });
  const isContentScrollable =
    contentScrollability.dataKey === dataKey && contentScrollability.isScrollable;
  const [isNativeAtBottomForButton, setIsNativeAtBottomForButton] = useState(true);
  const syncScrollButtonVisibility = useCallback((atBottom: boolean) => {
    setIsNativeAtBottomForButton(atBottom);
  }, []);
  const syncContentScrollability = useCallback(() => {
    const contentHeight =
      contentHeightRef.current.dataKey === dataKey ? contentHeightRef.current.height : 0;
    const nextIsScrollable =
      viewportHeightRef.current > 0 && contentHeight > viewportHeightRef.current;
    setContentScrollability((current) => {
      if (current.dataKey === dataKey && current.isScrollable === nextIsScrollable) {
        return current;
      }
      return { dataKey, isScrollable: nextIsScrollable };
    });
  }, [dataKey]);
  const handleListContentSizeChange = useCallback(
    (_width: number, height: number) => {
      contentHeightRef.current = { dataKey, height };
      syncContentScrollability();
      handleContentSizeChange();
    },
    [dataKey, handleContentSizeChange, syncContentScrollability],
  );
  const handleListLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewportHeightRef.current = event.nativeEvent.layout.height;
      syncContentScrollability();
      handleLayout(event);
    },
    [handleLayout, syncContentScrollability],
  );

  useAnimatedReaction(
    () => isAtBottom.get(),
    (current, previous) => {
      if (previous === null || current !== previous) {
        runOnJS(syncScrollButtonVisibility)(current);
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
  const sharedValues = useMemo(() => ({ isAtEnd: isAtBottom }), [isAtBottom]);

  return (
    <MessageListDisclosureProvider onDisclosureToggle={handleDisclosureToggle}>
      <View className="flex-1">
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
              freeze={freeze}
              getItemType={getMessageRowType}
              keyExtractor={messageKeyExtractor}
              keyboardDismissMode={Platform.OS === 'android' ? 'on-drag' : 'interactive'}
              keyboardLiftBehavior="whenAtEnd"
              keyboardOffset={keyboardOffset}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={listHeader}
              {...(!dataKey ? { initialScrollAtEnd: true } : {})}
              maintainVisibleContentPosition={MAINTAIN_VISIBLE_CONTENT_POSITION}
              onContentSizeChange={handleListContentSizeChange}
              onLayout={handleListLayout}
              onLoad={handleLoad}
              onScroll={handleScroll}
              onStartReached={onLoadOlder ? handleStartReached : undefined}
              onStartReachedThreshold={0.05}
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
            bottomAccessoryHeight={bottomAccessoryHeight}
            gap={SCROLL_BUTTON_GAP_ABOVE_ACCESSORY}
            isAtBottom={!isContentScrollable || isNativeAtBottomForButton || isFollowing}
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
