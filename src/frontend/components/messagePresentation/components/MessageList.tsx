import { ScrollShadow } from '@cherrystudio/ui/components';
import { KeyboardAwareLegendList, useKeyboardScrollToEnd } from '@legendapp/list/keyboard';
import { type LegendListRef, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { type LayoutChangeEvent, useWindowDimensions, View } from 'react-native';
import { runOnJS, useAnimatedReaction, useSharedValue } from 'react-native-reanimated';

import { usePreference } from '@/frontend/data/hooks';
import { resolveTypographyScale } from '@/frontend/utils/typographyScale';
import { emitLayoutBenchProbe } from '@/shared/devBench/layoutBenchProbe';

import { AssistantMessage, MessageSlideInProvider, UserMessageRow } from '../messageRow';
import { useMessageSlideInFlight } from '../messageRow/slideIn/hooks/useMessageSlideInFlight';
import type { MessageListProps, MessagePresentationItem } from '../types';
import { useAnchorPin } from './hooks/useAnchorPin';
import {
  emitProgrammaticScroll,
  scrollLog,
  useLayoutBenchInstrumentation,
} from './hooks/useLayoutBenchInstrumentation';
import { ScrollToBottomButton } from './ScrollToBottomButton';

// 被锚定的用户消息距内容区顶部（顶部安全区/导航栏之下）的视觉间距。
const ANCHOR_TOP_GAP = 12;
const ANCHOR_MAX_TEXT_LINES = 2;
const SCROLL_BUTTON_GAP_ABOVE_ACCESSORY = 5;
const USER_MESSAGE_VERTICAL_PADDING = 32;

// 流式/待生成的助手消息高度会持续变化（loading 圆点 → 思考块 → 正文流入）。若它被
// maintainVisibleContentPosition 选作锚点，列表会为「保持它的位置不变」而反向平移整块内容，
// 把已钉顶的用户消息顶下去（实测：「思考中」首帧渲染时整块下移 ~72px 的突跳）。
// 返回 false 把 pending 助手消息排除出 MVCP 的锚点候选，迫使它只锚定稳定项（上方的用户消息 /
// 历史消息），钉顶的用户消息在整个流式过程中纹丝不动。历史消息为 success 态仍参与锚定，
// 向上翻页加载旧消息的位置保持不受影响。
function shouldRestoreMessagePosition(item: MessagePresentationItem): boolean {
  return !(item.role === 'assistant' && item.status === 'pending');
}

const MAINTAIN_VISIBLE_CONTENT_POSITION = {
  data: true,
  shouldRestorePosition: shouldRestoreMessagePosition,
};

function messageKeyExtractor(item: MessagePresentationItem) {
  return item.id;
}

// 让 LegendList 按消息类型分别维护尺寸均值（FlashList 式 getItemType）。用户气泡（~100-200px）与
// 助手回复（含表格/代码块/数学，~700-2200px）高度量级差 2-7×，单一 estimatedItemSize=300 对二者都偏。
// LegendList 内部（react-native.mjs getItemSize）优先用「已测量的同类型行的真实均值 averageSizes[type].avg」
// 估算未测量行，无则才退回 estimatedItemSize。按 role 分类后，向上翻页 prepend / 滚回历史时，新行用
// 各自类型的真实均值定位 → MVCP/初始 bootstrap 的「估算→真实」修正幅度大幅收窄，减少可见跳动。
//
// 「还没有内容的助手行」必须单独成一类，否则同一机制会反过来制造跳动：刚发出消息时新建的
// 助手行只是个加载点（实测 52px），若按 assistant 的均值估算，它会先占住上一条长回复的高度
// （实测 3012px）再塌回去——一帧内内容少了 2964px，预留空白与钉顶落点都要跟着重算。
// 分类后修正量 2964px → 5px。
//
// 注意它**不是**「发送后跳一下」的成因：分类修好之后，续轮发送前那一帧 -310px 的突跳原样
// 还在，另有其因（收键盘按记录量回退，见 useAnchorPin 里 handleAnchorReady 的说明与
// patches/）。两件事都在同一瞬间发生，别再合并归因。
//
// 判据用「有没有 part」而不是 status：类型翻转因此发生在第一个 chunk 落地时，那一刻行还只有
// 几十像素，翻转本身不产生可见修正；而 status 要到整条回复结束才变，翻转时行已有数千像素。
// 翻转后这一行的后续增长计入 assistant 均值，空行阶段的尺寸留在 assistant-empty，两个均值
// 各自都稳定。
function getMessageRowType(item: MessagePresentationItem) {
  if (item.role !== 'assistant') {
    return item.role;
  }

  return item.data.parts?.length ? 'assistant' : 'assistant-empty';
}

function getAnchoredUserMessageIndex(messages: readonly MessagePresentationItem[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') {
      return index;
    }
  }

  return -1;
}

export function MessageList({
  bottomAccessoryHeight,
  contentBottomInset,
  contentTopInset,
  enteringMessageId,
  keyboardOffset,
  messages,
  onLoadOlder,
  onReady,
  renderAssistantMessage,
}: MessageListProps) {
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
  // 只服务于键盘探针：键盘事件里要报当时的预留空白（见 useLayoutBenchInstrumentation）。
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
    ({ item }: LegendListRenderItemProps<MessagePresentationItem>) =>
      item.role === 'user' ? (
        <UserMessageRow message={item} />
      ) : renderAssistantMessage ? (
        renderAssistantMessage(item)
      ) : (
        <AssistantMessage message={item} />
      ),
    [renderAssistantMessage],
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
    : ANCHOR_MAX_TEXT_LINES * resolveTypographyScale(fontSizeStep).base.lineHeight +
      USER_MESSAGE_VERTICAL_PADDING;
  const { freeze, scrollMessageToEnd } = useKeyboardScrollToEnd({ listRef });
  // 被锚定用户消息的固定落点：距内容区顶部（导航栏/安全区之下）ANCHOR_TOP_GAP。
  // anchoredEndSpace 与钉顶滚动共用同一偏移，保证「预留空白算出的位置」和「滚动落点」一致。
  const anchorOffset = contentTopInset + ANCHOR_TOP_GAP;
  const contentContainerStyle = useMemo(
    () => ({ paddingBottom: contentBottomInset, paddingTop: 12 }),
    [contentBottomInset],
  );

  // 入场行的起飞点：钉顶落点正下方、输入框上缘。三个量都是运行时布局值，所以它随机型、
  // 字号、输入框行数与键盘状态自适应，没有任何写死的距离。这是**总**行程，钉顶滚动与行的
  // 弹簧各分走一段（见 useAnchorPin）。
  //
  // 新话题的第一条消息会让列表**带着数据**挂载，而 viewportHeight 是 onLayout 回填的 state、
  // 首帧还是 0：不兜底的话行程为 0，气泡会先在落点画一帧再跳回起飞点飞一遍。窗口高度偏大只
  // 意味着停得更靠下（本来就在视口外，看不见），实测值到达后装填 effect 会在开火前校正。
  // ready-gate 不用这个兜底值——它必须等真实测量（见 useAnchorPin 的 viewportHeight 早退）。
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
  } = useAnchorPin({
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

  useLayoutBenchInstrumentation({ endSpaceRef, freeze, isAtBottom, scrollOffset });

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
            freeze={freeze}
            getItemType={getMessageRowType}
            keyExtractor={messageKeyExtractor}
            keyboardDismissMode="interactive"
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
        {bottomAccessoryHeight && messages.length > 0 ? (
          <ScrollToBottomButton
            gap={SCROLL_BUTTON_GAP_ABOVE_ACCESSORY}
            inputHeight={bottomAccessoryHeight}
            isAtBottom={isAtBottomForButton}
            onPress={handleScrollToEnd}
          />
        ) : null}
      </View>
    </MessageSlideInProvider>
  );
}
