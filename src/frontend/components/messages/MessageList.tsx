import { ScrollShadow, ScrollToBottomButton } from '@cherrystudio/ui/components';
import { KeyboardAwareLegendList, useKeyboardScrollToEnd } from '@legendapp/list/keyboard';
import { type LegendListRef, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, Platform, View } from 'react-native';
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
    handleLoad,
    handleMomentumScrollBegin,
    handleMomentumScrollEnd,
    handleScroll,
    handleScrollBeginDrag,
    handleScrollEndDrag,
    handleScrollToEnd,
    handleTouchStart,
    isFollowing,
    onViewportSizeChange,
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

  const listHeader = useMemo(() => <View style={{ height: contentTopInset }} />, [contentTopInset]);
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
  const handleLayout = useCallback(
    (_event: LayoutChangeEvent) => {
      onViewportSizeChange();
    },
    [onViewportSizeChange],
  );
  const sharedValues = useMemo(() => ({ isAtEnd: isAtBottom }), [isAtBottom]);
  const handleScrollButtonPress = useCallback(() => {
    setIsNativeAtBottomForButton(true);
    handleScrollToEnd();
  }, [handleScrollToEnd]);

  return (
    <View className="flex-1">
      <ScrollShadow className="flex-1" visibility="bottom" size={80}>
        <KeyboardAwareLegendList
          ref={listRef}
          applyWorkaroundForContentInsetHitTestBug
          contentContainerStyle={contentContainerStyle}
          contentInsetAdjustmentBehavior="never"
          data={messages}
          {...(dataKey ? { dataKey } : {})}
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
          onMomentumScrollBegin={handleMomentumScrollBegin}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          onScroll={handleScroll}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEndDrag}
          onStartReached={onLoadOlder ? handleStartReached : undefined}
          onStartReachedThreshold={0.05}
          onTouchStart={handleTouchStart}
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
      </ScrollShadow>
      {messages.length > 0 ? (
        <ScrollToBottomButton
          accessibilityLabel={t('chat.message.scrollToBottom')}
          bottomAccessoryHeight={bottomAccessoryHeight}
          gap={SCROLL_BUTTON_GAP_ABOVE_ACCESSORY}
          isAtBottom={isNativeAtBottomForButton || isFollowing}
          onPress={handleScrollButtonPress}
        />
      ) : null}
    </View>
  );
}
