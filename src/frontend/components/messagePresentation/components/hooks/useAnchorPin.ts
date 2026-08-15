import { type LegendListRef } from '@legendapp/list/react-native';
import {
  type RefObject,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { type LayoutChangeEvent } from 'react-native';

import { emitLayoutBenchProbe } from '@/shared/devBench/layoutBenchProbe';

import { emitProgrammaticScroll, scrollLog } from './useLayoutBenchInstrumentation';

// 撤遮罩（onReady）前要求内容高度保持「静默」的窗口：这段时间内没有任何 contentSize 变化才判定
// settle 完成。用于覆盖**冷 markdown 解析**——首次进入 topic 时 streamdown/代码/数学的 tokenize
// 与 layout 全冷、耗时最长，行的真实高度可能在初始 rAF 之后才测出。若此时已 reportReady 撤遮罩，
// 迟到的高度修正就泄漏成「第一次进入才有的跳动」。静默窗口内任何 contentSize 变化都会（经 effect
// 依赖 contentBaseHeight 重跑）取消并重启计时，从而把迟到修正也挡在遮罩后，与设备快慢无关。
const READY_SETTLE_MS = 150;

// 锚定生命周期：新用户消息就绪后钉顶（handleAnchorReady）、单轮工作区的首锚 staging、
// 以及首帧揭示前的 ready-gate。它是尾随状态机之外唯一会主动滚动列表的地方，所以必须
// 拿到 useTailFollow 的 isUserInteractingRef（只读）守同一个交互不变式，并在预留空白
// 耗尽时经 notifyAnchorSpaceClosed 把相位交接给尾随。
export function useAnchorPin({
  anchorIndex,
  anchorMessageId,
  animateFirstEnteringMessage,
  contentBottomInset,
  endSpaceRef,
  enteringMessageId,
  isUserInteractingRef,
  lastMessageId,
  listRef,
  notifyAnchorSpaceClosed,
  onReady,
  scrollMessageToEnd,
}: {
  anchorIndex: number;
  anchorMessageId: string | undefined;
  animateFirstEnteringMessage: boolean;
  contentBottomInset: number;
  endSpaceRef: RefObject<number>;
  enteringMessageId: string | undefined;
  isUserInteractingRef: RefObject<boolean>;
  lastMessageId: string | undefined;
  listRef: RefObject<LegendListRef | null>;
  notifyAnchorSpaceClosed: () => void;
  onReady: (() => void) | undefined;
  scrollMessageToEnd: (options: { animated: boolean; closeKeyboard: boolean }) => Promise<void>;
}): {
  handleAnchorReady: (info: { anchorKey: string | undefined }) => void;
  handleAnchoredEndSpaceSizeChanged: (size: number) => void;
  handleContentSizeChange: (width: number, height: number) => void;
  handleLayout: (event: LayoutChangeEvent) => void;
  isStagingFirstAnchor: boolean;
  releaseStagedFirstAnchor: () => void;
} {
  const [contentBaseHeight, setContentBaseHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const didReportReadyRef = useRef(false);
  const isMountedRef = useRef(true);
  const pendingReadyFrameRef = useRef<number | null>(null);
  const pendingReadySettleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyGenerationRef = useRef(0);
  // 揭示前的定位只做一次，见下方 gate 处的说明。
  const didGateScrollRef = useRef(false);
  const pendingFirstAnchorReleaseFrameRef = useRef<number | null>(null);

  // A single-turn workspace has no previous content to scroll past. Keep its first live turn at
  // the list end until the rows report a real size; then add the anchor space and animate to it.
  const [releasedFirstAnchorId, setReleasedFirstAnchorId] = useState<string>();
  const isFirstEnteringAnchor =
    animateFirstEnteringMessage &&
    anchorIndex === 0 &&
    anchorMessageId !== undefined &&
    anchorMessageId === enteringMessageId;
  const isStagingFirstAnchor = isFirstEnteringAnchor && releasedFirstAnchorId !== anchorMessageId;
  const stagedFirstAnchorIdRef = useRef<string | undefined>(undefined);

  // Read from size and layout callbacks, which the platform dispatches well
  // after commit, so mirroring the staged anchor here is soon enough.
  useLayoutEffect(() => {
    stagedFirstAnchorIdRef.current = isStagingFirstAnchor ? anchorMessageId : undefined;
  }, [anchorMessageId, isStagingFirstAnchor]);

  const releaseStagedFirstAnchor = useCallback(() => {
    const stagedAnchorId = stagedFirstAnchorIdRef.current;
    if (!stagedAnchorId || pendingFirstAnchorReleaseFrameRef.current !== null) {
      return;
    }

    pendingFirstAnchorReleaseFrameRef.current = requestAnimationFrame(() => {
      pendingFirstAnchorReleaseFrameRef.current = null;
      if (stagedFirstAnchorIdRef.current === stagedAnchorId) {
        setReleasedFirstAnchorId(stagedAnchorId);
      }
    });
  }, []);

  // 把刚发送的用户消息锚定到内容区顶部，并在其下方补足空白，让助手回复流式生长其间。
  //
  // onReady 是钉顶的正确触发点：LegendList 只在「锚点下方所有 item 尺寸都已**真实测量**」
  // （含刚 mount 的助手 pending 占位、hasUnknownTailSize=false）后，才把预留空白算成真实值
  // 并回调 onReady。此刻落点已是终值。
  //
  // 默认首轮瞬时定位，后续实时发送在权威尺寸就绪后动画钉顶；需要单轮工作区也播放
  // 完整锚定动画时，由调用方显式开启 animateFirstEnteringMessage。历史恢复仍瞬时定位。
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
      const shouldAnimate = isEnteringMessage && (animateFirstEnteringMessage || anchorIndex > 0);
      requestAnimationFrame(() => {
        emitProgrammaticScroll('anchorReady', listRef, { animated: shouldAnimate });
        // 收键盘与钉顶滚动**必须**同时发起，别再试着把它挪到滚动之后：改成「先钉顶、
        // 动画结束再收键盘」实测反转从 1 处 310px 变成 2 处 334px（位移搬到动画终点，
        // 还要再被尾随滚动拉一次），更差。
        //
        // 这里曾经有一帧 -310px 的突跳，成因**不是**「收键盘抽掉底部 inset 触发原生夹回」
        // ——inset 全程是 max(预留空白 512, 键盘 310) = 512，一动没动。真正写值的是
        // react-native-keyboard-controller 的 keyboardWillHide worklet：它按**键盘抬起
        // 那一刻记录下来的抬升量**原样回退，而这两次键盘事件之间预留空白从 0 涨到了 512、
        // 可滚动末端跟着下移，回退的前提已经不成立。修法是 patches/ 里那个补丁：让
        // whenAtEnd 在键盘变矮时「夹到当下的合法区间」而不是「按记录量回退」，两者只在
        // 这一个情形下不同，其余逐值相同。补丁掉了这个跳动就会回来。
        void scrollMessageToEnd({
          animated: shouldAnimate,
          closeKeyboard: isEnteringMessage,
        });
      });
    },
    [animateFirstEnteringMessage, anchorIndex, enteringMessageId, listRef, scrollMessageToEnd],
  );

  const handleAnchoredEndSpaceSizeChanged = useCallback(
    (size: number) => {
      endSpaceRef.current = size;
      emitLayoutBenchProbe('endSpace', { size: Math.round(size) });

      if (size > 0) {
        return;
      }

      notifyAnchorSpaceClosed();
    },
    [endSpaceRef, notifyAnchorSpaceClosed],
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
      emitLayoutBenchProbe('content', {
        h: Math.round(height),
        ready: didReportReadyRef.current,
      });
      setContentBaseHeight(Math.max(0, height - contentBottomInset));
      releaseStagedFirstAnchor();
    },
    [contentBottomInset, releaseStagedFirstAnchor],
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    emitLayoutBenchProbe('viewport', { h: Math.round(event.nativeEvent.layout.height) });
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

        // 本 effect 依赖 contentBaseHeight，而流式每来一个 chunk 内容高度就变一次 → 静默窗口
        // 反复重启、gate 在整段流式里每帧重跑，这个 scrollToEnd 于是变成第二条不受尾随状态机
        // 管的自动滚动。它必须和 scheduleTailFollow 守同一个不变式：用户手上有动作时一律不滚，
        // 否则拖动过程中列表会被硬拽回底部（实测一次拖动被拽 +198px，harness 的
        // gesture-conflict 判据就是这么抓到的）。
        // 跳过滚动但照常进入 settle：遮罩存在的意义是挡住布局抖动，人都已经在拖了就别再挡着。
        //
        // 交互锁只挡住「用户在拖」，挡不住重跑本身：在**新建话题**里发第一条时，流式让静默窗口
        // 永不完成 → ready 永远报不出 → gate 每次重跑都真滚一次（实测三轮 58/45/75 次，
        // stream-scroll 49/25/42 次）。这些滚动全落在「内容还不满一屏」的阶段，末端就是顶端，
        // 于是表现为 offset 在 0 与 24/40 之间来回弹四五次。续轮发送一次都不出现，只因为它
        // 进话题时 ready 早就报过、gate 已关闭——这个不对称本身就是「gate 越界」的证据。
        //
        // 因此揭示前的定位只做一次：它的语义是「首屏揭示前把列表放到正确位置」，本就是一次性
        // 事件。此后位置维护归尾随状态机（scheduleTailFollow）与 anchoredEndSpace，gate 只负责
        // 继续守静默窗口、把迟到的高度修正挡在遮罩后——这一半没有变。
        if (
          shouldScrollToEndBeforeReady &&
          !didGateScrollRef.current &&
          !isUserInteractingRef.current
        ) {
          didGateScrollRef.current = true;
          scrollLog.debug('[SCROLL] gateScrollToEnd', {
            contentBottomInset,
            contentBaseHeight: Math.round(contentBaseHeight),
            viewportHeight: Math.round(viewportHeight),
            t: Date.now(),
          });
          emitProgrammaticScroll('readyGate', listRef);
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
    isUserInteractingRef,
    lastMessageId,
    listRef,
    viewportHeight,
  ]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (pendingFirstAnchorReleaseFrameRef.current !== null) {
        cancelAnimationFrame(pendingFirstAnchorReleaseFrameRef.current);
        pendingFirstAnchorReleaseFrameRef.current = null;
      }
      cancelPendingReadyFrame();
    };
  }, [cancelPendingReadyFrame]);

  return {
    handleAnchorReady,
    handleAnchoredEndSpaceSizeChanged,
    handleContentSizeChange,
    handleLayout,
    isStagingFirstAnchor,
    releaseStagedFirstAnchor,
  };
}
