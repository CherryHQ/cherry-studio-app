import { ContextMenuScrollBoundary, ScrollToBottomButton } from '@cherrystudio/ui/components';
import { KeyboardAwareLegendList, useKeyboardScrollToEnd } from '@legendapp/list/keyboard';
import { type LegendListRef, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import { runOnJS, useAnimatedReaction, useSharedValue } from 'react-native-reanimated';

import {
  getMessageRowType,
  MAINTAIN_VISIBLE_CONTENT_POSITION,
  MESSAGE_LIST_TOP_PADDING,
  messageKeyExtractor,
} from './list/messageListLayout';
import { scrollLog } from './list/messageListLogger';
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
  headerAccessory,
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
  const [isNativeAtBottomForButton, setIsNativeAtBottomForButton] = useState(true);
  const syncScrollButtonVisibility = useCallback((atBottom: boolean) => {
    setIsNativeAtBottomForButton(atBottom);
  }, []);

  useAnimatedReaction(
    () => isAtBottom.get(),
    (current, previous) => {
      if (previous === null || current !== previous) {
        runOnJS(syncScrollButtonVisibility)(current);
      }
    },
  );

  const listHeader = useMemo(
    () => (
      <>
        <View style={{ height: contentTopInset }} />
        {headerAccessory}
      </>
    ),
    [contentTopInset, headerAccessory],
  );
  const contentContainerStyle = useMemo(
    () => ({ paddingBottom: contentBottomInset, paddingTop: MESSAGE_LIST_TOP_PADDING }),
    [contentBottomInset],
  );
  const renderMessageRow = useCallback(
    ({ item }: LegendListRenderItemProps<MessageListItem>) => (
      <MessageListRow message={item} renderMessage={renderMessage} />
    ),
    [renderMessage],
  );
  const handleStartReached = useCallback(() => {
    if (!onLoadOlder) {
      return;
    }

    scrollLog.debug('[SCROLL] startReached', { t: Date.now() });
    void onLoadOlder();
  }, [onLoadOlder]);
  const sharedValues = useMemo(() => ({ isAtEnd: isAtBottom }), [isAtBottom]);

  return (
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
            onContentSizeChange={handleContentSizeChange}
            onLayout={handleLayout}
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
          isAtBottom={isNativeAtBottomForButton || isFollowing}
          // The press only enters following mode, which already hides the
          // button. Mirroring an optimistic at-end state here would stick at
          // `true` whenever the scroll does not actually land at the end.
          onPress={handleScrollToEnd}
        />
      ) : null}
    </View>
  );
}
