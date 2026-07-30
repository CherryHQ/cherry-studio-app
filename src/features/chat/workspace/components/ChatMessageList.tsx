import { KeyboardAwareLegendList } from '@legendapp/list/keyboard';
import { type LegendListRef, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { ScrollShadow } from 'heroui-native/scroll-shadow';
import {
  type RefObject,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  View,
} from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { LinearGradient } from '@/components/nativePrimitives';
import { loggerService } from '@/core/logger/LoggerService';
import type { Message } from '@/shared/domain/message';

import { AssistantMessageItem, UserMessageItem } from '../../messageItem';
import { getMessageListScrollSignal } from '../utils/messageListScrollSignals';

// 滚动/布局诊断埋点：记录会驱动列表位移的关键数值（scroll offset、内容高度、锚点就绪、
// 翻页触发、钉顶滚动），用于把「界面跳动」量化成时间-位移轨迹。走 logger.debug → 仅 dev
// 输出（生产环境被日志级别过滤），故长期保留无碍。用 `[SCROLL]` 前缀便于从 Metro 日志过滤。
const scrollLog = loggerService.withContext('ChatScroll');

// 被锚定的用户消息距内容区顶部（顶部安全区/导航栏之下）的视觉间距。
const ANCHOR_TOP_GAP = 12;
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
function shouldRestoreMessagePosition(item: Message): boolean {
  return !(item.role === 'assistant' && item.status === 'pending');
}

const MAINTAIN_VISIBLE_CONTENT_POSITION = {
  data: true,
  shouldRestorePosition: shouldRestoreMessagePosition,
};

type ChatMessageListProps = {
  anchorIndex: number;
  contentBottomInset: number;
  contentTopInset: number;
  isAtBottom: SharedValue<boolean>;
  listRef: RefObject<LegendListRef | null>;
  messages: readonly Message[];
  onLoadOlder: () => Promise<void>;
  onPrefetchOlder: () => void;
  onReady?: () => void;
};

function renderMessageItem({ item }: LegendListRenderItemProps<Message>) {
  return item.role === 'user' ? (
    <UserMessageItem message={item} />
  ) : (
    <AssistantMessageItem message={item} />
  );
}

function messageKeyExtractor(item: Message) {
  return item.id;
}

// 让 LegendList 按消息类型分别维护尺寸均值（FlashList 式 getItemType）。用户气泡（~100-200px）与
// 助手回复（含表格/代码块/数学，~700-2200px）高度量级差 2-7×，单一 estimatedItemSize=300 对二者都偏。
// LegendList 内部（react-native.mjs getItemSize）优先用「已测量的同类型行的真实均值 averageSizes[type].avg」
// 估算未测量行，无则才退回 estimatedItemSize。按 role 分类后，向上翻页 prepend / 滚回历史时，新行用
// 各自类型的真实均值定位 → MVCP/初始 bootstrap 的「估算→真实」修正幅度大幅收窄，减少可见跳动。
function getMessageItemType(item: Message) {
  return item.role;
}

export function ChatMessageList({
  anchorIndex,
  contentBottomInset,
  contentTopInset,
  isAtBottom,
  listRef,
  messages,
  onLoadOlder,
  onPrefetchOlder,
  onReady,
}: ChatMessageListProps) {
  const [contentBaseHeight, setContentBaseHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const didReportReadyRef = useRef(false);
  const isMountedRef = useRef(true);
  const pendingReadyFrameRef = useRef<number | null>(null);
  const pendingReadySettleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyGenerationRef = useRef(0);
  const lastMessageId = messages[messages.length - 1]?.id;
  const listHeader = useMemo(() => <View style={{ height: contentTopInset }} />, [contentTopInset]);
  const handleStartReached = useCallback(() => {
    scrollLog.debug('[SCROLL] startReached', { t: Date.now() });
    void onLoadOlder();
  }, [onLoadOlder]);
  const hasAnchor = anchorIndex >= 0;
  // 被锚定用户消息的固定落点：距内容区顶部（导航栏/安全区之下）ANCHOR_TOP_GAP。
  // anchoredEndSpace 与钉顶滚动共用同一偏移，保证「预留空白算出的位置」和「滚动落点」一致。
  const anchorOffset = contentTopInset + ANCHOR_TOP_GAP;
  const visibleHeightAboveInput = Math.max(0, viewportHeight - contentBottomInset);
  // 锚定期间内容区始终视为「已撑满」，恒为浮动输入框预留底部空间。
  const bottomPadding =
    hasAnchor || (viewportHeight > 0 && contentBaseHeight > visibleHeightAboveInput)
      ? contentBottomInset
      : 0;

  const contentContainerStyle = useMemo(
    () => ({
      paddingBottom: bottomPadding,
      paddingTop: 12,
    }),
    [bottomPadding],
  );

  // 把刚发送的用户消息锚定到内容区顶部，并在其下方补足空白，让助手回复流式生长其间。
  //
  // onReady 是钉顶的正确触发点：LegendList 只在「锚点下方所有 item 尺寸都已**真实测量**」
  // （含刚 mount 的助手 pending 占位、hasUnknownTailSize=false）后，才把预留空白算成真实值
  // 并回调 onReady。此刻落点已是终值。
  //
  // 关键：这里用 `animated: false` 瞬时定位，**不是**动画滚动。对齐 v0 iOS 的做法——
  // 动画滚动（animated:true）会在 ~300ms 内追一个「还在异步收敛」的目标（estimatedItemSize
  // 300→真实、空白 0→真实都在动画途中阶跃），滚动一路纠偏 = pin 前的抖动。改成测量就绪后
  // 一次性瞬定，消息直接落到顶部、无追逐、无过冲；入场的柔和感交给气泡自身的 fade。
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
      requestAnimationFrame(() => {
        void listRef.current?.scrollToEnd({ animated: false });
      });
    },
    [listRef],
  );

  // 不设 anchorMaxSize：用被锚定用户消息的**真实完整高度**参与预留空白计算，使其顶部恒钉在
  // anchorOffset（导航栏之下）、从顶部完整显示。此前用 120 截断会把超长消息「超出的部分滚出屏顶」，
  // 表现为发送后消息「从中间钉」、顶部钻进 header（空话题首条尤其明显）。代价：比整屏还高的消息，
  // 其助手回复会落在首屏之下、需向下滚动（对齐 ChatGPT 的行为）。
  const anchoredEndSpace = useMemo(
    () =>
      hasAnchor
        ? {
            anchorIndex,
            anchorOffset,
            onReady: handleAnchorReady,
          }
        : undefined,
    [anchorIndex, anchorOffset, handleAnchorReady, hasAnchor],
  );

  // 锚定期间禁用 maintainScrollAtEnd：流式更新同一条消息时 legend-list 仍判为 dataChange
  // （对象引用变、无 itemsAreEqual），保留 onDataChange 会逐帧滚到底=跟随。改由下方 effect 在
  // 「新消息到达」时滚一次把消息钉顶，流式期间靠 maintainVisibleContentPosition 把消息稳在顶部。
  const maintainScrollAtEnd = useMemo(
    () =>
      hasAnchor
        ? undefined
        : { animated: false, on: { dataChange: true, itemLayout: true, layout: true } },
    [hasAnchor],
  );

  // 把列表「是否精确在最底部」同步到共享值，驱动悬浮的「滚动到底部」按钮显隐。
  const sharedValues = useMemo(() => ({ isAtEnd: isAtBottom }), [isAtBottom]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      // 滚动位移轨迹：y=当前滚动偏移，ch=内容总高，vh=视口高。逐帧连成时间-位移曲线后，
      // 「跳动」= y 的非单调突变。scrollEventThrottle 见下方 props（诊断期设 16 取每帧）。
      scrollLog.debug('[SCROLL] scroll', {
        y: Math.round(contentOffset.y),
        ch: Math.round(contentSize.height),
        vh: Math.round(layoutMeasurement.height),
        t: Date.now(),
      });

      const { isNearStart } = getMessageListScrollSignal(event);

      if (isNearStart) {
        onPrefetchOlder();
      }
    },
    [onPrefetchOlder],
  );

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
      setContentBaseHeight(Math.max(0, height - bottomPadding));
    },
    [bottomPadding],
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setViewportHeight(event.nativeEvent.layout.height);
  }, []);

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

    const shouldScrollToEndBeforeReady = bottomPadding > 0;

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
            bottomPadding,
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
    bottomPadding,
    cancelPendingReadyFrame,
    contentBaseHeight,
    lastMessageId,
    listRef,
    viewportHeight,
  ]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      cancelPendingReadyFrame();
    };
  }, [cancelPendingReadyFrame]);

  return (
    <ScrollShadow
      LinearGradientComponent={LinearGradient}
      className="flex-1"
      visibility="bottom"
      size={80}
    >
      <KeyboardAwareLegendList
        ref={listRef}
        anchoredEndSpace={anchoredEndSpace}
        automaticallyAdjustsScrollIndicatorInsets
        contentContainerStyle={contentContainerStyle}
        contentInsetAdjustmentBehavior="never"
        data={messages}
        drawDistance={80}
        estimatedItemSize={300}
        estimatedHeaderSize={contentTopInset}
        getItemType={getMessageItemType}
        keyExtractor={messageKeyExtractor}
        keyboardDismissMode="interactive"
        keyboardLiftBehavior="whenAtEnd"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={listHeader}
        initialScrollAtEnd
        maintainScrollAtEnd={maintainScrollAtEnd}
        maintainScrollAtEndThreshold={0.12}
        maintainVisibleContentPosition={MAINTAIN_VISIBLE_CONTENT_POSITION}
        onContentSizeChange={handleContentSizeChange}
        onLayout={handleLayout}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onStartReached={handleStartReached}
        onStartReachedThreshold={0.05}
        recycleItems={false}
        renderItem={renderMessageItem}
        scrollsToTop
        sharedValues={sharedValues}
        className="flex-1"
      />
    </ScrollShadow>
  );
}
