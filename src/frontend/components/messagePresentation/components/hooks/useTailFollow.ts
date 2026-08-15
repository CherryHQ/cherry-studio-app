import { type LegendListRef } from '@legendapp/list/react-native';
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type SharedValue, useSharedValue } from 'react-native-reanimated';

import { emitLayoutBenchProbe } from '@/shared/devBench/layoutBenchProbe';

import { emitProgrammaticScroll } from './useLayoutBenchInstrumentation';

const TAIL_FOLLOW_END_THRESHOLD = 20;

// 尾随不逐次「贴死底部」，而是每帧朝底部推进剩余距离的这个比例（60fps 下时间常数约 47ms）。
//
// 正文按整行阶跃长高——行高 20px，一次 chunk 常带 2~5 行——而内容更新只有约 35Hz，显示是
// 60Hz。贴死底部等于把这串阶跃原样复制成滚动位移：实测尾随期 45% 的帧一动不动、下一帧蹦
// 40~100px，三场景各有 67~68% 的位移集中在那几次跳里（`follow-cadence` 判据量的就是它），
// 而均速只有 800~900px/s。按比例逼近把同一段位移摊到之后几帧上，均速不变、瞬时速度收敛。
//
// 代价是稳定滞后约 v×τ ≈ 40px（两行）：流式期间最新一行离视口底部会多留两行的余量，
// 内容一停就在 ~150ms 内收敛到底。
const TAIL_FOLLOW_RESPONSE = 0.3;
// 指数逼近的尾巴无限长，差到这个距离以内直接落位。落位调 `scrollToEnd` 而不是自己算的落点：
// `contentLength - scrollLength` 是 LegendList 的记账值，与原生 contentSize 可能差一点，
// 长期以它为准会停在离底部差几像素的地方，`isAtEnd` 判定跟着一起错。
const TAIL_FOLLOW_SETTLE_PX = 1.5;
// 比例步在尾段会小于一像素，那几十毫秒既没有可见运动、又够不到落位条件。
const TAIL_FOLLOW_MIN_STEP_PX = 2;

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
}: {
  anchorMessageId: string | undefined;
  hasAnchor: boolean;
  listRef: RefObject<LegendListRef | null>;
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
  const pendingTailFollowFrameRef = useRef<number | null>(null);
  // 逼近器自己记的落点。**不能每帧改读 `listState.scroll`**：那是节流上报的值，落后于我们
  // 刚下的命令，用它算剩余距离等于每帧都从旧位置重新起步、一步跨到底，逼近直接退化回贴死
  // 底部。置 null＝下一帧以列表实测值重新对表（进入尾随、手势结束、落位之后）。
  const followOffsetRef = useRef<number | null>(null);
  const pendingInteractionEndFrameRef = useRef<number | null>(null);
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

  useLayoutEffect(() => {
    tailFollowPhaseRef.current = tailFollowPhase;
    // anchoring 与 following 都由 app 主动把列表推向底部（钉顶滚动 / 尾随滚动），
    // 只有 paused 全程不自动滚。没有锚点时不存在任何自动滚动，交回 isAtEnd 单独判定。
    isTailControlled.set(hasAnchor && tailFollowPhase !== 'paused');
    // 相位决定同一条位移轨迹该被判成合格还是缺陷（钉顶期应静止、尾随期应跟随），
    // 所以它必须作为独立信号进日志，否则 harness 无从判定。
    emitLayoutBenchProbe('phase', { anchorId: anchorMessageId, phase: tailFollowPhase });
  }, [anchorMessageId, hasAnchor, isTailControlled, tailFollowPhase]);

  // LegendList 的 maintainScrollAtEnd 会在 rAF 中捕获旧配置，拖动已暂停后仍可能执行一次。
  // 在应用层合并 follow 请求，并在直接派发给原生 ScrollView 前重新检查同步交互锁。
  const cancelPendingTailFollow = useCallback(() => {
    followOffsetRef.current = null;
    if (pendingTailFollowFrameRef.current !== null) {
      cancelAnimationFrame(pendingTailFollowFrameRef.current);
      pendingTailFollowFrameRef.current = null;
    }
  }, []);

  // 循环自维持：只要还没追上底部就续下一帧，追上就停。内容在这期间继续长高不必重新调度
  // ——每帧都重读目标，`scheduleTailFollow` 的重入守卫会把途中的调用吞掉。
  const scheduleTailFollow = useCallback(() => {
    if (
      tailFollowPhaseRef.current !== 'following' ||
      isUserInteractingRef.current ||
      pendingTailFollowFrameRef.current !== null
    ) {
      return;
    }

    const step = () => {
      pendingTailFollowFrameRef.current = null;

      if (tailFollowPhaseRef.current !== 'following' || isUserInteractingRef.current) {
        followOffsetRef.current = null;
        return;
      }

      const nativeScrollRef = listRef.current?.getNativeScrollRef() as
        | {
            scrollTo?: (options: { animated?: boolean; y: number }) => void;
            scrollToEnd?: (options: { animated?: boolean }) => void;
          }
        | null
        | undefined;
      const settle = () => {
        followOffsetRef.current = null;
        emitProgrammaticScroll('tailFollow', listRef, { step: 'settle' });
        nativeScrollRef?.scrollToEnd?.({ animated: false });
      };

      const listState = listRef.current?.getState();
      if (!listState || listState.scrollLength <= 0) {
        settle();
        return;
      }

      const target = listState.contentLength - listState.scrollLength;
      const from = followOffsetRef.current ?? listState.scroll;
      const remaining = target - from;
      // 负的剩余距离（内容缩短）一并走落位分支，交给 scrollToEnd 定夺。
      if (remaining <= TAIL_FOLLOW_SETTLE_PX) {
        settle();
        return;
      }

      const next =
        from +
        Math.min(remaining, Math.max(remaining * TAIL_FOLLOW_RESPONSE, TAIL_FOLLOW_MIN_STEP_PX));
      followOffsetRef.current = next;
      emitProgrammaticScroll('tailFollow', listRef, { step: 'ease', to: Math.round(next) });
      nativeScrollRef?.scrollTo?.({ animated: false, y: next });
      pendingTailFollowFrameRef.current = requestAnimationFrame(step);
    };

    pendingTailFollowFrameRef.current = requestAnimationFrame(step);
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
      cancelPendingTailFollow();
    };
  }, [cancelPendingInteractionEnd, cancelPendingTailFollow]);

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
