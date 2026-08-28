import { ScrollShadow, ScrollToBottomButton } from '@cherrystudio/ui/components';
import { resolveTypographyScale } from '@cherrystudio/ui/utils';
import { KeyboardAwareLegendList, useKeyboardScrollToEnd } from '@legendapp/list/keyboard';
import { type LegendListRef, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, Platform, useWindowDimensions, View } from 'react-native';
import { runOnJS, useAnimatedReaction, useSharedValue } from 'react-native-reanimated';

import { usePreference } from '@/frontend/data/hooks';
import { emitLayoutBenchProbe } from '@/shared/devBench/layoutBenchProbe';

import {
  ANCHOR_TOP_GAP,
  getAnchoredUserMessageIndex,
  getMessageRowType,
  MAINTAIN_VISIBLE_CONTENT_POSITION,
  messageKeyExtractor,
  resolveUserMessageAnchorMaxSize,
} from './list/messageListLayout';
import { MessageListRow } from './list/MessageListRow';
import { useMessageListAnchorPin } from './list/useMessageListAnchorPin';
import {
  emitProgrammaticScroll,
  scrollLog,
  useMessageListInstrumentation,
} from './list/useMessageListInstrumentation';
import { MessageSlideInProvider } from './motion/MessageSlideInProvider';
import { useMessageSlideInFlight } from './motion/useMessageSlideInFlight';
import type { MessageListProps, MessageListItem } from './types';

const SCROLL_BUTTON_GAP_ABOVE_ACCESSORY = 5;

export function MessageList({
  bottomAccessoryHeight,
  contentBottomInset,
  contentTopInset,
  enteringMessageId,
  extraData,
  keyboardOffset,
  messages,
  onLoadOlder,
  onReady,
  renderMessage,
}: MessageListProps) {
  const { t } = useTranslation();
  const listRef = useRef<LegendListRef | null>(null);
  const isAtBottom = useSharedValue(true);
  const [isAtBottomForButton, setIsAtBottomForButton] = useState(true);
  const syncScrollButtonVisibility = useCallback((atBottom: boolean) => {
    setIsAtBottomForButton(atBottom);
  }, []);

  useAnimatedReaction(
    () => isAtBottom.get(),
    (current, previous) => {
      if (previous === null || current !== previous) {
        runOnJS(syncScrollButtonVisibility)(current);
      }
    },
  );
  // 位移轨迹的来源。注意**不能**用 `onScroll`：本列表经 KeyboardAwareLegendList →
  // AnimatedLegendList 渲染，滚动被 reanimated 的 `useScrollViewOffset` 接管，JS 侧的
  // `onScroll` 回调实测一次都不触发。`sharedValues.scrollOffset` 才是这套组件栈支持的
  // 读法，且它在 UI 线程逐帧更新，比 JS 回调更贴近真实位移。
  const scrollOffset = useSharedValue(0);
  // 只服务于键盘探针：键盘事件里要报当时的预留空白（见 useMessageListInstrumentation）。
  const endSpaceRef = useRef(0);
  // 视口高度由列表自己测：ready-gate 与入场行的起飞距离都要用，谁也不该拥有另一个的测量。
  const [viewportHeight, setViewportHeight] = useState(0);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    emitLayoutBenchProbe('viewport', { h: Math.round(event.nativeEvent.layout.height) });
    setViewportHeight(event.nativeEvent.layout.height);
  }, []);
  const [fontSizeStep] = usePreference('ui.font_size_step');
  const lastMessageId = messages[messages.length - 1]?.id;
  const anchorIndex = getAnchoredUserMessageIndex(messages);
  const listHeader = useMemo(() => <View style={{ height: contentTopInset }} />, [contentTopInset]);
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
  const hasAnchor = anchorIndex >= 0;
  const anchorMessage = hasAnchor ? messages[anchorIndex] : undefined;
  const anchorHasFile = anchorMessage?.data.parts?.some((part) => part.type === 'file') ?? false;
  const anchorMaxSize = anchorHasFile
    ? undefined
    : resolveUserMessageAnchorMaxSize(resolveTypographyScale(fontSizeStep).base.lineHeight);
  const { freeze, scrollMessageToEnd } = useKeyboardScrollToEnd({ listRef });
  // 被锚定用户消息的固定落点：距内容区顶部（导航栏/安全区之下）ANCHOR_TOP_GAP。
  // anchoredEndSpace 与钉顶滚动共用同一偏移，保证「预留空白算出的位置」和「滚动落点」一致。
  const anchorOffset = contentTopInset + ANCHOR_TOP_GAP;
  const contentContainerStyle = useMemo(
    () => ({ paddingBottom: contentBottomInset, paddingTop: ANCHOR_TOP_GAP }),
    [contentBottomInset],
  );

  // 入场行的起飞点：钉顶落点正下方、输入框上缘。三个量都是运行时布局值，所以它随机型、
  // 字号、输入框行数与键盘状态自适应，没有任何写死的距离。这是**总**行程，钉顶滚动与行的
  // 弹簧各分走一段（见 useMessageListAnchorPin）。
  //
  // 新话题的第一条消息会让列表**带着数据**挂载，而 viewportHeight 是 onLayout 回填的 state、
  // 首帧还是 0：不兜底的话行程为 0，气泡会先在落点画一帧再跳回起飞点飞一遍。窗口高度偏大只
  // 意味着停得更靠下（本来就在视口外，看不见），实测值到达后装填 effect 会在开火前校正。
  // ready-gate 不用这个兜底值——它必须等真实测量（见 useMessageListAnchorPin 的早退）。
  const { height: windowHeight } = useWindowDimensions();
  const slideInTravel = Math.max(
    0,
    (viewportHeight || windowHeight) - contentBottomInset - anchorOffset,
  );
  // 入场那一轮的助手占位行：待发消息的下一条。它在同一次 overlay 注入里出现，所以装填时一定
  // 已经在列表里；拿它做「等用户行落位再显形」的对象，而不是笼统的「最后一行」——流式期间
  // 最后一行还是它，但那时飞行早已结束，不该再被 opacity 碰。
  const enteringFollowerId = useMemo(() => {
    if (!enteringMessageId) {
      return undefined;
    }

    const enteringIndex = messages.findIndex((message) => message.id === enteringMessageId);
    return enteringIndex < 0 ? undefined : messages[enteringIndex + 1]?.id;
  }, [enteringMessageId, messages]);
  const slideInFlight = useMessageSlideInFlight({
    enteringMessageId,
    followerMessageId: enteringFollowerId,
    travel: slideInTravel,
  });

  const {
    handleAnchorReady,
    handleAnchoredEndSpaceSizeChanged,
    handleContentSizeChange,
    handleMomentumScrollBegin,
    handleMomentumScrollEnd,
    handleScrollBeginDrag,
    handleScrollEndDrag,
    handleTouchEnd,
    handleTouchStart,
  } = useMessageListAnchorPin({
    contentBottomInset,
    endSpaceRef,
    enteringMessageId,
    lastMessageId,
    listRef,
    onAnchorPinned: slideInFlight.launch,
    onReady,
    scrollMessageToEnd,
    viewportHeight,
  });

  useMessageListInstrumentation({ endSpaceRef, freeze, isAtBottom, scrollOffset });

  const handleItemSizeChanged = useCallback(
    (info: { index: number; itemKey: string; previous: number; size: number }) => {
      // 同一行的高度反复变化 = 渲染抖动，是「流式期间内容上下弹」最直接的量化指标。
      emitLayoutBenchProbe('itemSize', {
        index: info.index,
        key: info.itemKey,
        prev: Math.round(info.previous),
        size: Math.round(info.size),
      });
    },
    [],
  );

  // 纯文本按当前字号最多以两行参与锚点计算；文件/图片使用完整实测高度，避免媒体被顶出屏幕。
  const anchoredEndSpace = useMemo(
    () =>
      hasAnchor
        ? {
            anchorIndex,
            anchorMaxSize,
            anchorOffset,
            onReady: handleAnchorReady,
            onSizeChanged: handleAnchoredEndSpaceSizeChanged,
          }
        : undefined,
    [
      anchorIndex,
      anchorMaxSize,
      anchorOffset,
      handleAnchorReady,
      handleAnchoredEndSpaceSizeChanged,
      hasAnchor,
    ],
  );

  // 共享值供布局探针读取；按钮用同一 LegendList 状态的 React 回调，避免 shared value
  // 跨过流式重渲染边界后显隐动画停在初始值。
  const sharedValues = useMemo(
    () => ({ isAtEnd: isAtBottom, scrollOffset }),
    [isAtBottom, scrollOffset],
  );
  const handleScrollToEnd = useCallback(() => {
    emitProgrammaticScroll('button', listRef);
    void listRef.current?.scrollToEnd({ animated: true });
  }, []);

  return (
    <MessageSlideInProvider flight={slideInFlight}>
      <View className="flex-1">
        <ScrollShadow className="flex-1" visibility="bottom" size={80}>
          <KeyboardAwareLegendList
            ref={listRef}
            applyWorkaroundForContentInsetHitTestBug
            anchoredEndSpace={anchoredEndSpace}
            contentContainerStyle={contentContainerStyle}
            contentInsetAdjustmentBehavior="never"
            data={messages}
            drawDistance={80}
            estimatedItemSize={300}
            estimatedHeaderSize={contentTopInset}
            extraData={extraData}
            freeze={freeze}
            getItemType={getMessageRowType}
            keyExtractor={messageKeyExtractor}
            keyboardDismissMode={Platform.OS === 'android' ? 'on-drag' : 'interactive'}
            // 贴底时才让键盘抬起内容——在历史里翻看时点输入框，内容不该跟着动。
            // 别改成 persistent：它的收起分支确实不产生位移（那正是 patches/ 里给
            // whenAtEnd 补上的语义），但它的抬起分支恒抬、且收起时把抬起量保住，
            // 在历史区反复聚焦/失焦会像棘轮一样把列表一格格推到底。
            keyboardLiftBehavior="whenAtEnd"
            keyboardOffset={keyboardOffset}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={listHeader}
            initialScrollAtEnd
            maintainVisibleContentPosition={MAINTAIN_VISIBLE_CONTENT_POSITION}
            onContentSizeChange={handleContentSizeChange}
            onItemSizeChanged={handleItemSizeChanged}
            onLayout={handleLayout}
            onMomentumScrollBegin={handleMomentumScrollBegin}
            onMomentumScrollEnd={handleMomentumScrollEnd}
            onScrollBeginDrag={handleScrollBeginDrag}
            onScrollEndDrag={handleScrollEndDrag}
            onStartReached={onLoadOlder ? handleStartReached : undefined}
            onStartReachedThreshold={0.05}
            onTouchCancel={handleTouchEnd}
            onTouchEnd={handleTouchEnd}
            onTouchStart={handleTouchStart}
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
            isAtBottom={isAtBottomForButton}
            onPress={handleScrollToEnd}
          />
        ) : null}
      </View>
    </MessageSlideInProvider>
  );
}
