import { ScrollShadow } from '@cherrystudio/ui/components';
import { KeyboardAwareLegendList, useKeyboardScrollToEnd } from '@legendapp/list/keyboard';
import { type LegendListRef, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  View,
} from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { usePreference } from '@/frontend/data/hooks';
import { resolveTypographyScale } from '@/frontend/utils/typographyScale';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { AssistantMessageRow, MessageSlideInProvider, UserMessageRow } from '../messageRow';
import type { MessageListProps, MessagePresentationItem } from '../types';
import { ScrollToBottomButton } from './ScrollToBottomButton';

// 滚动/布局诊断埋点：记录会驱动列表位移的关键数值（scroll offset、内容高度、锚点就绪、
// 翻页触发、钉顶滚动），用于把「界面跳动」量化成时间-位移轨迹。走 logger.debug → 仅 dev
// 输出（生产环境被日志级别过滤），故长期保留无碍。用 `[SCROLL]` 前缀便于从 Metro 日志过滤。
const scrollLog = loggerService.withContext('ChatScroll');

// 被锚定的用户消息距内容区顶部（顶部安全区/导航栏之下）的视觉间距。
const ANCHOR_TOP_GAP = 12;
const ANCHOR_MAX_TEXT_LINES = 2;
const SCROLL_BUTTON_GAP_ABOVE_ACCESSORY = 5;
const USER_MESSAGE_VERTICAL_PADDING = 32;
// 撤遮罩（onReady）前要求内容高度保持「静默」的窗口：这段时间内没有任何 contentSize 变化才判定
// settle 完成。用于覆盖**冷 markdown 解析**——首次进入 topic 时 streamdown/代码/数学的 tokenize
// 与 layout 全冷、耗时最长，行的真实高度可能在初始 rAF 之后才测出。若此时已 reportReady 撤遮罩，
// 迟到的高度修正就泄漏成「第一次进入才有的跳动」。静默窗口内任何 contentSize 变化都会（经 effect
// 依赖 contentBaseHeight 重跑）取消并重启计时，从而把迟到修正也挡在遮罩后，与设备快慢无关。
const READY_SETTLE_MS = 150;

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

const TAIL_FOLLOW_END_THRESHOLD = 20;

type TailFollowPhase = 'anchoring' | 'following' | 'paused';

type TailFollowState = {
  anchorMessageId: string | undefined;
  phase: TailFollowPhase;
};

function createTailFollowState(anchorMessageId: string | undefined): TailFollowState {
  return { anchorMessageId, phase: 'anchoring' };
}

function resolveTailFollowState(
  state: TailFollowState,
  anchorMessageId: string | undefined,
): TailFollowState {
  return state.anchorMessageId === anchorMessageId ? state : createTailFollowState(anchorMessageId);
}

function renderMessageRow({ item }: LegendListRenderItemProps<MessagePresentationItem>) {
  return item.role === 'user' ? (
    <UserMessageRow message={item} />
  ) : (
    <AssistantMessageRow message={item} />
  );
}

function messageKeyExtractor(item: MessagePresentationItem) {
  return item.id;
}

// 让 LegendList 按消息类型分别维护尺寸均值（FlashList 式 getItemType）。用户气泡（~100-200px）与
// 助手回复（含表格/代码块/数学，~700-2200px）高度量级差 2-7×，单一 estimatedItemSize=300 对二者都偏。
// LegendList 内部（react-native.mjs getItemSize）优先用「已测量的同类型行的真实均值 averageSizes[type].avg」
// 估算未测量行，无则才退回 estimatedItemSize。按 role 分类后，向上翻页 prepend / 滚回历史时，新行用
// 各自类型的真实均值定位 → MVCP/初始 bootstrap 的「估算→真实」修正幅度大幅收窄，减少可见跳动。
function getMessageRowType(item: MessagePresentationItem) {
  return item.role;
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
}: MessageListProps) {
  const listRef = useRef<LegendListRef | null>(null);
  const isAtBottom = useSharedValue(true);
  const [fontSizeStep] = usePreference('ui.font_size_step');
  const [contentBaseHeight, setContentBaseHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const didReportReadyRef = useRef(false);
  const isMountedRef = useRef(true);
  const pendingReadyFrameRef = useRef<number | null>(null);
  const pendingReadySettleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyGenerationRef = useRef(0);
  const pendingTailFollowFrameRef = useRef<number | null>(null);
  const pendingInteractionEndFrameRef = useRef<number | null>(null);
  const isTouchingListRef = useRef(false);
  const isDraggingListRef = useRef(false);
  const isMomentumScrollingRef = useRef(false);
  const isUserInteractingRef = useRef(false);
  const lastMessageId = messages[messages.length - 1]?.id;
  const anchorIndex = getAnchoredUserMessageIndex(messages);
  const listHeader = useMemo(() => <View style={{ height: contentTopInset }} />, [contentTopInset]);
  const handleStartReached = useCallback(() => {
    if (!onLoadOlder) {
      return;
    }

    scrollLog.debug('[SCROLL] startReached', { t: Date.now() });
    void onLoadOlder();
  }, [onLoadOlder]);
  const hasAnchor = anchorIndex >= 0;
  const anchorMessage = hasAnchor ? messages[anchorIndex] : undefined;
  const anchorMessageId = anchorMessage?.id;
  const [tailFollowState, setTailFollowState] = useState<TailFollowState>(() =>
    createTailFollowState(anchorMessageId),
  );
  const tailFollowPhase = resolveTailFollowState(tailFollowState, anchorMessageId).phase;
  const tailFollowPhaseRef = useRef(tailFollowPhase);
  const isFollowing = tailFollowPhase === 'following';
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

  useLayoutEffect(() => {
    tailFollowPhaseRef.current = tailFollowPhase;
  }, [tailFollowPhase]);

  // LegendList 的 maintainScrollAtEnd 会在 rAF 中捕获旧配置，拖动已暂停后仍可能执行一次。
  // 在应用层合并 follow 请求，并在直接派发给原生 ScrollView 前重新检查同步交互锁。
  const cancelPendingTailFollow = useCallback(() => {
    if (pendingTailFollowFrameRef.current !== null) {
      cancelAnimationFrame(pendingTailFollowFrameRef.current);
      pendingTailFollowFrameRef.current = null;
    }
  }, []);

  const scheduleTailFollow = useCallback(() => {
    if (
      tailFollowPhaseRef.current !== 'following' ||
      isUserInteractingRef.current ||
      pendingTailFollowFrameRef.current !== null
    ) {
      return;
    }

    pendingTailFollowFrameRef.current = requestAnimationFrame(() => {
      pendingTailFollowFrameRef.current = null;

      if (tailFollowPhaseRef.current !== 'following' || isUserInteractingRef.current) {
        return;
      }

      const nativeScrollRef = listRef.current?.getNativeScrollRef() as
        | { scrollToEnd?: (options: { animated?: boolean }) => void }
        | null
        | undefined;
      nativeScrollRef?.scrollToEnd?.({ animated: false });
    });
  }, [listRef]);

  const isListAtEnd = useCallback(() => {
    const listState = listRef.current?.getState();
    if (!listState || listState.scrollLength <= 0) {
      return false;
    }

    const distanceFromEnd = listState.contentLength - listState.scrollLength - listState.scroll;
    return Number.isFinite(distanceFromEnd) && distanceFromEnd <= TAIL_FOLLOW_END_THRESHOLD;
  }, [listRef]);

  const resumeTailFollowAtEnd = useCallback(() => {
    if (!anchorMessageId || tailFollowPhaseRef.current !== 'paused' || !isListAtEnd()) {
      return;
    }

    tailFollowPhaseRef.current = 'following';
    setTailFollowState((previous) => {
      const current = resolveTailFollowState(previous, anchorMessageId);
      return current.phase === 'paused' ? { ...current, phase: 'following' } : current;
    });
    scheduleTailFollow();
  }, [anchorMessageId, isListAtEnd, scheduleTailFollow]);

  const cancelPendingInteractionEnd = useCallback(() => {
    if (pendingInteractionEndFrameRef.current !== null) {
      cancelAnimationFrame(pendingInteractionEndFrameRef.current);
      pendingInteractionEndFrameRef.current = null;
    }
  }, []);

  const finishUserInteraction = useCallback(() => {
    if (isTouchingListRef.current || isDraggingListRef.current || isMomentumScrollingRef.current) {
      return;
    }

    isUserInteractingRef.current = false;
    if (tailFollowPhaseRef.current === 'paused') {
      resumeTailFollowAtEnd();
    } else {
      scheduleTailFollow();
    }
  }, [resumeTailFollowAtEnd, scheduleTailFollow]);

  const scheduleInteractionEnd = useCallback(() => {
    cancelPendingInteractionEnd();
    pendingInteractionEndFrameRef.current = requestAnimationFrame(() => {
      pendingInteractionEndFrameRef.current = null;
      finishUserInteraction();
    });
  }, [cancelPendingInteractionEnd, finishUserInteraction]);

  const beginUserInteraction = useCallback(() => {
    isUserInteractingRef.current = true;
    cancelPendingInteractionEnd();
    cancelPendingTailFollow();
  }, [cancelPendingInteractionEnd, cancelPendingTailFollow]);

  // 把刚发送的用户消息锚定到内容区顶部，并在其下方补足空白，让助手回复流式生长其间。
  //
  // onReady 是钉顶的正确触发点：LegendList 只在「锚点下方所有 item 尺寸都已**真实测量**」
  // （含刚 mount 的助手 pending 占位、hasUnknownTailSize=false）后，才把预留空白算成真实值
  // 并回调 onReady。此刻落点已是终值。
  //
  // 首轮瞬时定位，后续实时发送在权威尺寸就绪后动画钉顶；历史恢复仍瞬时定位。
  const scrolledAnchorKeyRef = useRef<string | undefined>(undefined);
  const handleAnchorReady = useCallback(
    (info: { anchorKey: string | undefined }) => {
      // 只在锚点切换到「新一条用户消息」时钉顶一次；回复流式增长（同一 anchorKey）不重滚。
      if (!info.anchorKey || scrolledAnchorKeyRef.current === info.anchorKey) {
        return;
      }

      scrolledAnchorKeyRef.current = info.anchorKey;
      scrollLog.debug('[SCROLL] anchorReady->scrollToEnd', {
        anchorKey: info.anchorKey,
        t: Date.now(),
      });
      const isEnteringMessage = info.anchorKey === enteringMessageId;
      const shouldAnimate = isEnteringMessage && anchorIndex > 0;
      requestAnimationFrame(() => {
        void scrollMessageToEnd({
          animated: shouldAnimate,
          closeKeyboard: isEnteringMessage,
        });
      });
    },
    [anchorIndex, enteringMessageId, scrollMessageToEnd],
  );

  const handleAnchoredEndSpaceSizeChanged = useCallback(
    (size: number) => {
      if (size > 0 || !anchorMessageId) {
        return;
      }

      const nextPhase = isUserInteractingRef.current ? 'paused' : 'following';
      tailFollowPhaseRef.current = nextPhase;
      setTailFollowState((previous) => {
        const current = resolveTailFollowState(previous, anchorMessageId);
        if (current.phase !== 'anchoring') {
          return current;
        }

        return { ...current, phase: nextPhase };
      });
    },
    [anchorMessageId],
  );

  const handleEndVisible = useCallback(
    (visible: boolean) => {
      if (!visible || isUserInteractingRef.current) {
        return;
      }

      resumeTailFollowAtEnd();
    },
    [resumeTailFollowAtEnd],
  );

  const handleScrollBeginDrag = useCallback(() => {
    isDraggingListRef.current = true;
    beginUserInteraction();

    if (!anchorMessageId) {
      return;
    }

    tailFollowPhaseRef.current =
      tailFollowPhaseRef.current === 'following' ? 'paused' : tailFollowPhaseRef.current;
    setTailFollowState((previous) => {
      const current = resolveTailFollowState(previous, anchorMessageId);
      if (current.phase !== 'following') {
        return current;
      }

      return { ...current, phase: 'paused' };
    });
  }, [anchorMessageId, beginUserInteraction]);

  const handleScrollEndDrag = useCallback(() => {
    isDraggingListRef.current = false;
    scheduleInteractionEnd();
  }, [scheduleInteractionEnd]);

  const handleMomentumScrollBegin = useCallback(() => {
    isMomentumScrollingRef.current = true;
    beginUserInteraction();
  }, [beginUserInteraction]);

  const handleMomentumScrollEnd = useCallback(() => {
    isMomentumScrollingRef.current = false;
    scheduleInteractionEnd();
  }, [scheduleInteractionEnd]);

  const handleTouchStart = useCallback(() => {
    isTouchingListRef.current = true;
    beginUserInteraction();
  }, [beginUserInteraction]);

  const handleTouchEnd = useCallback(() => {
    isTouchingListRef.current = false;
    scheduleInteractionEnd();
  }, [scheduleInteractionEnd]);

  const handleItemSizeChanged = useCallback(() => {
    scheduleTailFollow();
  }, [scheduleTailFollow]);

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

  const maintainVisibleContentPosition = isFollowing
    ? Platform.OS === 'android'
      ? false
      : undefined
    : MAINTAIN_VISIBLE_CONTENT_POSITION;
  // 把列表「是否精确在最底部」同步到共享值，驱动悬浮的「滚动到底部」按钮显隐。
  const sharedValues = useMemo(() => ({ isAtEnd: isAtBottom }), [isAtBottom]);
  const handleScrollToEnd = useCallback(() => {
    void listRef.current?.scrollToEnd({ animated: true });
  }, []);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    // 滚动位移轨迹：y=当前滚动偏移，ch=内容总高，vh=视口高。逐帧连成时间-位移曲线后，
    // 「跳动」= y 的非单调突变。scrollEventThrottle 见下方 props（诊断期设 16 取每帧）。
    scrollLog.debug('[SCROLL] scroll', {
      y: Math.round(contentOffset.y),
      ch: Math.round(contentSize.height),
      vh: Math.round(layoutMeasurement.height),
      t: Date.now(),
    });
  }, []);

  const cancelPendingReadyFrame = useCallback(() => {
    if (pendingReadyFrameRef.current !== null) {
      cancelAnimationFrame(pendingReadyFrameRef.current);
      pendingReadyFrameRef.current = null;
    }
    if (pendingReadySettleRef.current !== null) {
      clearTimeout(pendingReadySettleRef.current);
      pendingReadySettleRef.current = null;
    }
  }, []);

  const reportReady = useEffectEvent(() => {
    if (didReportReadyRef.current || !isMountedRef.current) {
      return;
    }

    didReportReadyRef.current = true;
    onReady?.();
  });

  const handleContentSizeChange = useCallback(
    (_width: number, height: number) => {
      // ready=true 的 contentSize 变化 = 遮罩已撤/即将撤之后仍有高度修正 = 泄漏到可见区的跳动源。
      // 冷首次进入 markdown 解析慢，末次修正可能迟到落在 ready 之后 → 复现「第一次进入才跳」。
      scrollLog.debug('[SCROLL] contentSize', {
        h: Math.round(height),
        ready: didReportReadyRef.current,
        t: Date.now(),
      });
      setContentBaseHeight(Math.max(0, height - contentBottomInset));
    },
    [contentBottomInset],
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setViewportHeight(event.nativeEvent.layout.height);
  }, []);

  useEffect(() => {
    if (isFollowing) {
      scheduleTailFollow();
    }
  }, [isFollowing, messages, scheduleTailFollow]);

  useEffect(() => {
    readyGenerationRef.current += 1;
    const generation = readyGenerationRef.current;

    cancelPendingReadyFrame();

    if (
      didReportReadyRef.current ||
      contentBaseHeight <= 0 ||
      !lastMessageId ||
      viewportHeight <= 0
    ) {
      return;
    }

    const shouldScrollToEndBeforeReady = contentBottomInset > 0;

    pendingReadyFrameRef.current = requestAnimationFrame(() => {
      pendingReadyFrameRef.current = requestAnimationFrame(() => {
        pendingReadyFrameRef.current = null;

        if (
          didReportReadyRef.current ||
          !isMountedRef.current ||
          readyGenerationRef.current !== generation
        ) {
          return;
        }

        // 揭示前再等一个静默窗口（READY_SETTLE_MS）：期间若有任何 contentSize 变化，effect（依赖
        // contentBaseHeight）会重跑、经 cancelPendingReadyFrame 清掉此计时并重启，从而把冷 markdown
        // 迟到的高度修正也挡在遮罩后再揭示，消除「reload 后第一次进入才跳」。
        const reportReadyAfterSettle = () => {
          pendingReadySettleRef.current = setTimeout(() => {
            pendingReadySettleRef.current = null;

            if (readyGenerationRef.current === generation) {
              reportReady();
            }
          }, READY_SETTLE_MS);
        };

        if (shouldScrollToEndBeforeReady) {
          scrollLog.debug('[SCROLL] gateScrollToEnd', {
            contentBottomInset,
            contentBaseHeight: Math.round(contentBaseHeight),
            viewportHeight: Math.round(viewportHeight),
            t: Date.now(),
          });
          void listRef.current?.scrollToEnd({ animated: false }).finally(reportReadyAfterSettle);
          return;
        }

        reportReadyAfterSettle();
      });
    });
  }, [
    cancelPendingReadyFrame,
    contentBottomInset,
    contentBaseHeight,
    lastMessageId,
    listRef,
    viewportHeight,
  ]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      cancelPendingInteractionEnd();
      cancelPendingReadyFrame();
      cancelPendingTailFollow();
    };
  }, [cancelPendingInteractionEnd, cancelPendingReadyFrame, cancelPendingTailFollow]);

  return (
    <MessageSlideInProvider slideInMessageId={enteringMessageId}>
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
            keyboardLiftBehavior="whenAtEnd"
            keyboardOffset={keyboardOffset}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={listHeader}
            initialScrollAtEnd
            maintainVisibleContentPosition={maintainVisibleContentPosition}
            onContentSizeChange={handleContentSizeChange}
            onEndVisible={handleEndVisible}
            onItemSizeChanged={handleItemSizeChanged}
            onLayout={handleLayout}
            onMomentumScrollBegin={handleMomentumScrollBegin}
            onMomentumScrollEnd={handleMomentumScrollEnd}
            onScroll={handleScroll}
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
        {bottomAccessoryHeight ? (
          <ScrollToBottomButton
            gap={SCROLL_BUTTON_GAP_ABOVE_ACCESSORY}
            inputHeight={bottomAccessoryHeight}
            isAtBottom={isAtBottom}
            onPress={handleScrollToEnd}
          />
        ) : null}
      </View>
    </MessageSlideInProvider>
  );
}
