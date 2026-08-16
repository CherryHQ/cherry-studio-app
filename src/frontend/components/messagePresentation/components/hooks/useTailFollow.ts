import { type LegendListRef } from '@legendapp/list/react-native';
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type Animated from 'react-native-reanimated';
import {
  type AnimatedRef,
  runOnJS,
  scrollTo,
  type SharedValue,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';

import { emitLayoutBenchProbe } from '@/shared/devBench/layoutBenchProbe';

import { emitProgrammaticScroll } from './useLayoutBenchInstrumentation';

const TAIL_FOLLOW_END_THRESHOLD = 20;

// 尾随不逐次「贴死底部」，而是每帧朝底部推进剩余距离的这个比例。
//
// 正文按整行阶跃长高——行高 20px，一次 chunk 常带 2~5 行——而内容更新只有约 31Hz，显示是
// 120Hz。贴死底部等于把这串阶跃原样复制成滚动位移：实测尾随期 80~82% 的显示帧一动不动、
// 下一帧蹦 40~100px，三场景各有 67~68% 的位移集中在那几次跳里（`follow-cadence` 判据量的
// 就是它），而均速只有 800~900px/s。按比例逼近把同一段位移摊到之后几帧上，均速不变、
// 瞬时速度收敛，代价是稳定滞后 v×τ。
//
// 逼近跑在 **UI 线程**，这是它能兑现的前提。先在 JS 侧用 rAF 做过一版，静止帧占比只从 81%
// 降到 64~70%：流式期间 JS 被 chunk 处理连续占用约 25ms，rAF 因此只跑得到 44Hz——逼近器
// 自己就跑在被饿死的那条线程上。搬到 UI 线程后帧间隔缩短，同一个响应系数下滞后按比例一起
// 变小（滞后 ≈ v×帧间隔/系数）。
const TAIL_FOLLOW_RESPONSE = 0.3;
// 指数逼近的尾巴无限长，差到这个距离以内就交给 JS 侧的 `scrollToEnd` 落位：worklet 里算的
// `contentLength - scrollLength` 是 LegendList 的记账值，与原生 contentSize 可能差一点，
// 长期以它为准会停在离底部差几像素的地方，`isAtEnd` 判定跟着一起错。
const TAIL_FOLLOW_SETTLE_PX = 1.5;
// 比例步在尾段会小于一像素，那几十毫秒既没有可见运动、又够不到落位条件。
const TAIL_FOLLOW_MIN_STEP_PX = 2;
/** `followTarget` / `followOffset` 的空值。负数不可能是合法的尾随落点，省一个额外的标志位。 */
const TAIL_FOLLOW_NONE = -1;

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

// 尾随状态机：锚定（anchoring）→ 预留空白耗尽后尾随（following）→ 用户手势暂停（paused）
// → 回到底部恢复。它持有全部交互状态（touch/drag/momentum/isUserInteracting）——
// ready-gate 等其他自动滚动源必须与它守同一个不变式「用户手上有动作时一律不滚」，
// 所以 isUserInteractingRef 由这里单一持有、对外只读。
export function useTailFollow({
  anchorMessageId,
  hasAnchor,
  listRef,
  scrollOffset,
  scrollViewRef,
}: {
  anchorMessageId: string | undefined;
  hasAnchor: boolean;
  listRef: RefObject<LegendListRef | null>;
  /** UI 线程的实时位移，逼近器用它对表。 */
  scrollOffset: SharedValue<number>;
  scrollViewRef: AnimatedRef<Animated.ScrollView>;
}): {
  handleEndVisible: (visible: boolean) => void;
  handleMomentumScrollBegin: () => void;
  handleMomentumScrollEnd: () => void;
  handleScrollBeginDrag: () => void;
  handleScrollEndDrag: () => void;
  handleTouchEnd: () => void;
  handleTouchStart: () => void;
  isFollowing: boolean;
  isTailControlled: SharedValue<boolean>;
  isUserInteractingRef: RefObject<boolean>;
  notifyAnchorSpaceClosed: () => void;
  scheduleTailFollow: () => void;
} {
  // 尾随相位是 React state，worklet 读不到，镜像一份供按钮显隐推导使用。
  const isTailControlled = useSharedValue(false);
  const pendingInteractionEndFrameRef = useRef<number | null>(null);
  // 逼近器要追的底部。JS 侧只负责在内容长高时把它更新掉，剩下的全在 UI 线程——目标晚到几
  // 十毫秒不影响平滑，逼近器在两次更新之间继续走向上一个目标，这正是它顶得住 JS 卡顿的原因。
  const followTarget = useSharedValue(TAIL_FOLLOW_NONE);
  // 逼近器自己记的落点。**不能每帧改读实时位移**：原生 setContentOffset 到 `scrollOffset`
  // 回报之间隔着一帧，用它算剩余距离等于每帧都从旧位置重新起步、一步跨到底，逼近直接退化
  // 回贴死底部。置空＝下一帧重新对表（进入尾随、手势打断、落位之后）。
  const followOffset = useSharedValue(TAIL_FOLLOW_NONE);
  // 逼近器的开关。同样是给 worklet 看的镜像：相位是 React state、交互锁是 ref，两者它都读不到。
  const isFollowActive = useSharedValue(false);
  const isTouchingListRef = useRef(false);
  const isDraggingListRef = useRef(false);
  const isMomentumScrollingRef = useRef(false);
  const isUserInteractingRef = useRef(false);
  const [tailFollowState, setTailFollowState] = useState<TailFollowState>(() =>
    createTailFollowState(anchorMessageId),
  );
  const tailFollowPhase = resolveTailFollowState(tailFollowState, anchorMessageId).phase;
  const tailFollowPhaseRef = useRef(tailFollowPhase);
  const isFollowing = tailFollowPhase === 'following';

  // 逼近器只有一种停法：关掉开关、把落点和目标都置空。手势打断、离开尾随相位、卸载三处
  // 共用它——写成三份副本，漏掉其中一个 set 就是「关了却还在追上一个目标」。
  const stopTailFollow = useCallback(() => {
    isFollowActive.set(false);
    followOffset.set(TAIL_FOLLOW_NONE);
    followTarget.set(TAIL_FOLLOW_NONE);
  }, [followOffset, followTarget, isFollowActive]);

  useLayoutEffect(() => {
    tailFollowPhaseRef.current = tailFollowPhase;
    // 离开尾随相位就把逼近器停干净。它自己看不见相位，而**开**由 `scheduleTailFollow` 给、
    // **关**必须在这里兜住：新一轮消息会把状态机重置回 anchoring（见 resolveTailFollowState），
    // 那时钉顶滚动接管，逼近器若还醒着就是第二个改 offset 的力。
    if (tailFollowPhase !== 'following') {
      stopTailFollow();
    }

    // anchoring 与 following 都由 app 主动把列表推向底部（钉顶滚动 / 尾随滚动），
    // 只有 paused 全程不自动滚。没有锚点时不存在任何自动滚动，交回 isAtEnd 单独判定。
    isTailControlled.set(hasAnchor && tailFollowPhase !== 'paused');
    // 相位决定同一条位移轨迹该被判成合格还是缺陷（钉顶期应静止、尾随期应跟随），
    // 所以它必须作为独立信号进日志，否则 harness 无从判定。
    emitLayoutBenchProbe('phase', { anchorId: anchorMessageId, phase: tailFollowPhase });
  }, [anchorMessageId, hasAnchor, isTailControlled, stopTailFollow, tailFollowPhase]);

  // 落位由 JS 侧收尾：worklet 只知道 LegendList 记账的内容长度，`scrollToEnd` 才认原生
  // contentSize。每轮流式只发生一次（内容停止增长时），所以这一次跨线程回调不构成负担。
  const settleAtEnd = useCallback(() => {
    if (tailFollowPhaseRef.current !== 'following' || isUserInteractingRef.current) {
      return;
    }

    const nativeScrollRef = listRef.current?.getNativeScrollRef() as
      | { scrollToEnd?: (options: { animated?: boolean }) => void }
      | null
      | undefined;
    emitProgrammaticScroll('tailFollow', listRef, { step: 'settle' });
    nativeScrollRef?.scrollToEnd?.({ animated: false });
  }, [listRef]);

  // 逼近器本体。跑在 UI 线程，所以 JS 被 chunk 处理占满时它照样每个显示帧推进一步——这正是
  // 上一版跑在 rAF 上时做不到的（实测 JS 只喂得动 44Hz，静止帧占比卡在 64~70%）。
  //
  // worklet 里刻意不发探针：每帧一次 runOnJS 等于把刚绕开的那条线程重新拖住。逐帧轨迹由
  // `scrollOffset` 的 animated reaction 提供，本来就在（见 useLayoutBenchInstrumentation）。
  useFrameCallback(() => {
    'worklet';
    if (!isFollowActive.get()) {
      followOffset.set(TAIL_FOLLOW_NONE);
      return;
    }

    const target = followTarget.get();
    if (target === TAIL_FOLLOW_NONE) {
      return;
    }

    const tracked = followOffset.get();
    const from = tracked === TAIL_FOLLOW_NONE ? scrollOffset.get() : tracked;
    const remaining = target - from;
    // 负的剩余距离（内容缩短）一并走落位分支，交给 scrollToEnd 定夺。
    if (remaining <= TAIL_FOLLOW_SETTLE_PX) {
      followOffset.set(TAIL_FOLLOW_NONE);
      // 目标就地消费掉，否则下一帧还会满足落位条件，`settleAtEnd` 会被每帧回抛一次。
      followTarget.set(TAIL_FOLLOW_NONE);
      runOnJS(settleAtEnd)();
      return;
    }

    const next =
      from +
      Math.min(remaining, Math.max(remaining * TAIL_FOLLOW_RESPONSE, TAIL_FOLLOW_MIN_STEP_PX));
    followOffset.set(next);
    scrollTo(scrollViewRef, 0, next, false);
  });

  // JS 侧只负责把「底部在哪」告诉 UI 线程。
  const scheduleTailFollow = useCallback(() => {
    if (tailFollowPhaseRef.current !== 'following' || isUserInteractingRef.current) {
      return;
    }

    const listState = listRef.current?.getState();
    if (!listState || listState.scrollLength <= 0) {
      return;
    }

    isFollowActive.set(true);
    followTarget.set(listState.contentLength - listState.scrollLength);
  }, [followTarget, isFollowActive, listRef]);

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
    stopTailFollow();
  }, [cancelPendingInteractionEnd, stopTailFollow]);

  // 钉顶预留空白耗尽（onSizeChanged 报 0）＝锚定阶段结束，进入尾随；用户手上有动作则
  // 直接进 paused，不跟。
  const notifyAnchorSpaceClosed = useCallback(() => {
    if (!anchorMessageId) {
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
  }, [anchorMessageId]);

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
    // 交互窗口的边界：harness 用它圈出「手势期间」，窗口内出现任何 progScroll 即为冲突。
    emitLayoutBenchProbe('interaction', { kind: 'drag', state: 'begin' });
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
    emitLayoutBenchProbe('interaction', { kind: 'drag', state: 'end' });
    scheduleInteractionEnd();
  }, [scheduleInteractionEnd]);

  const handleMomentumScrollBegin = useCallback(() => {
    isMomentumScrollingRef.current = true;
    emitLayoutBenchProbe('interaction', { kind: 'momentum', state: 'begin' });
    beginUserInteraction();
  }, [beginUserInteraction]);

  const handleMomentumScrollEnd = useCallback(() => {
    isMomentumScrollingRef.current = false;
    emitLayoutBenchProbe('interaction', { kind: 'momentum', state: 'end' });
    scheduleInteractionEnd();
  }, [scheduleInteractionEnd]);

  const handleTouchStart = useCallback(() => {
    isTouchingListRef.current = true;
    emitLayoutBenchProbe('interaction', { kind: 'touch', state: 'begin' });
    beginUserInteraction();
  }, [beginUserInteraction]);

  const handleTouchEnd = useCallback(() => {
    isTouchingListRef.current = false;
    emitLayoutBenchProbe('interaction', { kind: 'touch', state: 'end' });
    scheduleInteractionEnd();
  }, [scheduleInteractionEnd]);

  useEffect(() => {
    return () => {
      cancelPendingInteractionEnd();
      stopTailFollow();
    };
  }, [cancelPendingInteractionEnd, stopTailFollow]);

  return {
    handleEndVisible,
    handleMomentumScrollBegin,
    handleMomentumScrollEnd,
    handleScrollBeginDrag,
    handleScrollEndDrag,
    handleTouchEnd,
    handleTouchStart,
    isFollowing,
    isTailControlled,
    isUserInteractingRef,
    notifyAnchorSpaceClosed,
    scheduleTailFollow,
  };
}
