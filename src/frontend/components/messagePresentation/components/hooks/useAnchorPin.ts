import { type LegendListRef } from '@legendapp/list/react-native';
import { type RefObject, useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';

import { emitLayoutBenchProbe } from '@/shared/devBench/layoutBenchProbe';

import { emitProgrammaticScroll, scrollLog } from './useLayoutBenchInstrumentation';

// 撤遮罩（onReady）前要求内容高度保持「静默」的窗口：这段时间内没有任何 contentSize 变化才判定
// settle 完成。用于覆盖**冷 markdown 解析**——首次进入 topic 时 streamdown/代码/数学的 tokenize
// 与 layout 全冷、耗时最长，行的真实高度可能在初始 rAF 之后才测出。若此时已 reportReady 撤遮罩，
// 迟到的高度修正就泄漏成「第一次进入才有的跳动」。静默窗口内任何 contentSize 变化都会（经 effect
// 依赖 contentBaseHeight 重跑）取消并重启计时，从而把迟到修正也挡在遮罩后，与设备快慢无关。
const READY_SETTLE_MS = 150;

// 锚定生命周期：新用户消息就绪后钉顶（handleAnchorReady）与首帧揭示前的 ready-gate。它是
// 尾随状态机之外唯一会主动滚动列表的地方，所以必须拿到 useTailFollow 的 isUserInteractingRef
// （只读）守同一个交互不变式，并在预留空白耗尽时经 notifyAnchorSpaceClosed 把相位交接给尾随。
//
// 入场的可见位移由两段拼成：这里的钉顶滚动把**旧内容**送出视口，行自身的 transform
// （useMessageSlideInFlight）走剩下的那段。落位那一帧经 onAnchorPinned 把「还差多少滚动」
// 交给它，两段相加恒等于设计行程。
export function useAnchorPin({
  contentBottomInset,
  endSpaceRef,
  enteringMessageId,
  isUserInteractingRef,
  lastMessageId,
  listRef,
  notifyAnchorSpaceClosed,
  onAnchorPinned,
  onReady,
  scrollMessageToEnd,
  viewportHeight,
}: {
  contentBottomInset: number;
  endSpaceRef: RefObject<number>;
  enteringMessageId: string | undefined;
  isUserInteractingRef: RefObject<boolean>;
  lastMessageId: string | undefined;
  listRef: RefObject<LegendListRef | null>;
  notifyAnchorSpaceClosed: () => void;
  onAnchorPinned: (pendingScrollPx: number) => void;
  onReady: (() => void) | undefined;
  scrollMessageToEnd: (options: { animated: boolean; closeKeyboard: boolean }) => Promise<void>;
  viewportHeight: number;
}): {
  handleAnchorReady: (info: { anchorKey: string | undefined }) => void;
  handleAnchoredEndSpaceSizeChanged: (size: number) => void;
  handleContentSizeChange: (width: number, height: number) => void;
} {
  const [contentBaseHeight, setContentBaseHeight] = useState(0);
  const didReportReadyRef = useRef(false);
  const isMountedRef = useRef(true);
  const pendingReadyFrameRef = useRef<number | null>(null);
  const pendingReadySettleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyGenerationRef = useRef(0);
  // 揭示前的定位只做一次，见下方 gate 处的说明。
  const didGateScrollRef = useRef(false);

  // 把刚发送的用户消息锚定到内容区顶部，并在其下方补足空白，让助手回复流式生长其间。
  //
  // onReady 是钉顶的正确触发点：LegendList 只在「锚点下方所有 item 尺寸都已**真实测量**」
  // （含刚 mount 的助手 pending 占位、hasUnknownTailSize=false）后，才把预留空白算成真实值
  // 并回调 onReady。此刻落点已是终值。
  //
  // 钉顶滚动保持**动画**。它搬的不是入场行，是**旧内容**：新消息要贴到视口顶部，原先在屏上
  // 的一切都得整体让位滑走。改成瞬时曾让这段一帧切掉（实测相邻两帧间整屏内容消失，模板相关度
  // 1.000→0.239），而参照实现与本项目此前的实现都是滑的（~150ms / ~240ms）。**判据抓不到它**
  // ——offset-reversal 只认往返，这是单向硬切，改成瞬时后它反而从 40px 变成 0。
  //
  // 与行的 transform 不会叠加成双倍行程：落位时把「还差多少滚动」交给 onAnchorPinned，弹簧
  // 只走剩下那段（见 useMessageSlideInFlight.launch）。新建话题里这个量恒为 0，弹簧独扛全程，
  // 所以第一条和后续走的总路程仍然一样。
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
      requestAnimationFrame(() => {
        // 这一帧还差多少滚动才到末端＝待会儿这次动画滚动会走的距离（onReady 保证预留空白与
        // 内容高度都已是终值）。**必须问列表自己**，别拿组件里那几个 React state 去重建：
        // contentBaseHeight 是上一次 onContentSizeChange 落下的值，助手占位行挂载带来的增高
        // 常常还没回灌，实测据此算出 202px 而真实滚动是 305px，行会多飞 103px。
        // getState().contentLength 已含预留空白（实测 3942 − 874 − 2762 = 306 = 实测滚动）。
        const listState = listRef.current?.getState();
        const pendingScrollPx = listState
          ? Math.max(0, listState.contentLength - listState.scrollLength - listState.scroll)
          : 0;
        emitProgrammaticScroll('anchorReady', listRef, { animated: true });
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
          animated: true,
          closeKeyboard: isEnteringMessage,
        });
        // 与滚动同帧开火：弹簧要从「扣掉这次滚动之后」的位置起跳，晚一帧就会先按全程显形。
        onAnchorPinned(pendingScrollPx);
      });
    },
    [enteringMessageId, listRef, onAnchorPinned, scrollMessageToEnd],
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
    },
    [contentBottomInset],
  );

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
      cancelPendingReadyFrame();
    };
  }, [cancelPendingReadyFrame]);

  return {
    handleAnchorReady,
    handleAnchoredEndSpaceSizeChanged,
    handleContentSizeChange,
  };
}
