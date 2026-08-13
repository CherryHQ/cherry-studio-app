import { ScrollShadow } from '@cherrystudio/ui/components';
import { KeyboardAwareLegendList, useKeyboardScrollToEnd } from '@legendapp/list/keyboard';
import { type LegendListRef, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import {
  type RefObject,
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
  View,
} from 'react-native';
import { KeyboardEvents } from 'react-native-keyboard-controller';
import {
  runOnJS,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';

import { usePreference } from '@/frontend/data/hooks';
import { resolveTypographyScale } from '@/frontend/utils/typographyScale';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { emitLayoutBenchProbe, isLayoutBenchProbeArmed } from '@/shared/devBench/layoutBenchProbe';

import { AssistantMessageRow, MessageSlideInProvider, UserMessageRow } from '../messageRow';
import type { MessageListProps, MessagePresentationItem } from '../types';
import { followingMaintainVisibleContentPosition } from './messageListPlatform/messageListPlatform';
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
// 助手行只是个加载点（实测 48px），若按 assistant 的均值估算，它会先占住上一条长回复的高度
// （实测 3012px）再塌回去——一帧内内容少了 2964px，预留空白与钉顶落点都要跟着重算。
// 分类后修正量 2964px → 5px。
//
// 注意它**不是**「发送后跳一下」的成因：分类修好之后，续轮发送前那一帧 -310px 的突跳原样
// 还在（见 scripts/layout-bench/known-issues.json）。两件事都在同一瞬间发生，别再合并归因。
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

// 「滚动到底部」按钮的显隐完全由 UI 线程的 shared value 驱动（opacity/pointerEvents 都是
// worklet 计算），JS 侧看不到状态变化，所以只能从 worklet 里回抛。
function emitButtonVisibility(visible: boolean) {
  emitLayoutBenchProbe('button', { visible });
}

function emitScrollOffset(y: number) {
  emitLayoutBenchProbe('scroll', { y: Math.round(y) });
}

function emitFreeze(on: boolean) {
  emitLayoutBenchProbe('freeze', { on });
}

// 键盘收放只改滚动视图的底部 inset，既不改 contentSize 也不改视口，因此它挪动内容却不留下
// 任何其它探针能看见的痕迹。发送时 `scrollMessageToEnd` 正好同时发起收键盘与钉顶滚动，
// 缺了这条时间线就没法判断那一帧的位移是谁造成的。
//
// 订阅不能按 `isLayoutBenchProbeArmed()` 开关：探针由假模型在**第一次发送**时 arm，而这个
// effect 在列表挂载时就跑完了，按 armed 判断等于永远不订阅（实测整轮零 keyboard 事件）。
// 改成 dev 下常驻订阅、由 emit 自己按 armed 过滤——键盘事件只在收放时各一条，不像 onScroll
// 那样每帧都有，常驻的代价可以忽略。
function useKeyboardProbe() {
  useEffect(() => {
    if (!__DEV__) {
      return;
    }

    const subscriptions = (['keyboardWillShow', 'keyboardWillHide'] as const).map((event) =>
      KeyboardEvents.addListener(event, ({ duration, height }) => {
        emitLayoutBenchProbe('keyboard', { dur: duration, event, h: Math.round(height) });
      }),
    );

    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);
}

// 程序化滚动只记「谁调的」不够：同一个 scrollToEnd 落到哪里，取决于调用瞬间列表认为的
// 内容长度与视口长度。发送消息时这两个量正在剧烈变化（新行未测量、预留空白在重算），
// 落点因此可能远离用户当前位置——把三个量与调用点一起记下才谈得上归因。
function emitProgrammaticScroll(
  src: string,
  listRef: RefObject<LegendListRef | null>,
  extra?: Record<string, boolean | number | string | undefined>,
) {
  if (!isLayoutBenchProbeArmed()) {
    return;
  }

  const listState = listRef.current?.getState();
  emitLayoutBenchProbe('progScroll', {
    ...extra,
    content: listState ? Math.round(listState.contentLength) : undefined,
    scroll: listState ? Math.round(listState.scroll) : undefined,
    src,
    viewport: listState ? Math.round(listState.scrollLength) : undefined,
  });
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
  animateFirstEnteringMessage = false,
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
  // 位移轨迹的来源。注意**不能**用 `onScroll`：本列表经 KeyboardAwareLegendList →
  // AnimatedLegendList 渲染，滚动被 reanimated 的 `useScrollViewOffset` 接管，JS 侧的
  // `onScroll` 回调实测一次都不触发。`sharedValues.scrollOffset` 才是这套组件栈支持的
  // 读法，且它在 UI 线程逐帧更新，比 JS 回调更贴近真实位移。
  const scrollOffset = useSharedValue(0);
  // arm 发生在假模型被构造时（晚于本组件挂载），worklet 读不到 JS 侧的模块变量，
  // 因此每次渲染把 arm 状态同步进 shared value，未 arm 时连 runOnJS 都不发生。
  const probeArmed = useSharedValue(false);
  // 尾随相位是 React state，worklet 读不到，镜像一份供按钮显隐推导使用。
  const isTailControlled = useSharedValue(false);
  const [fontSizeStep] = usePreference('ui.font_size_step');
  const [contentBaseHeight, setContentBaseHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const didReportReadyRef = useRef(false);
  const isMountedRef = useRef(true);
  const pendingReadyFrameRef = useRef<number | null>(null);
  const pendingReadySettleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyGenerationRef = useRef(0);
  const pendingFirstAnchorReleaseFrameRef = useRef<number | null>(null);
  const pendingTailFollowFrameRef = useRef<number | null>(null);
  const pendingInteractionEndFrameRef = useRef<number | null>(null);
  const isTouchingListRef = useRef(false);
  const isDraggingListRef = useRef(false);
  const isMomentumScrollingRef = useRef(false);
  const isUserInteractingRef = useRef(false);
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
        <AssistantMessageRow message={item} />
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
  const anchorMessageId = anchorMessage?.id;
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

  useEffect(() => {
    probeArmed.set(isLayoutBenchProbeArmed());
  });

  // 「滚动到底部」只在**用户自己**离开底部时才有意义。而 isAtEnd 用的是 ~0px 的判定边界，
  // 只要 app 正把列表往底部推（钉顶动画、流式尾随），内容每长一截都会先把视口挤离底部、
  // 下一帧滚动再吸回来，isAtEnd 就跟着以帧为周期翻转（实测一轮流式 33 次）。
  //
  // 关键是**不能**拿「是否在尾随」去否决它：相位是 React state，镜像进 shared value 必然是
  // JS→UI 的跨线程写，落地比 UI 线程自己翻的 isAtEnd 晚一帧，那一帧里两个条件都为假，按钮
  // 照闪不误（实测把镜像挪进 layout effect 也没用，晚的是线程不是 React 时序）。
  // 换成「列表是否正被程序化接管」后，延迟的方向就全是安全的：进入接管态发生在用户刚发出
  // 消息、列表本就贴底的那一刻，anchoring→following 根本不改变它；退出接管态只会让按钮晚
  // 一帧出现。paused 是唯一不会自动滚的相位，也正是按钮该出现的相位。
  const isScrollButtonHidden = useDerivedValue(() => isAtBottom.get() || isTailControlled.get());

  useAnimatedReaction(
    () => isScrollButtonHidden.get(),
    (current, previous) => {
      if (previous !== null && current !== previous) {
        runOnJS(emitButtonVisibility)(!current);
      }
    },
  );

  useAnimatedReaction(
    () => scrollOffset.get(),
    (current, previous) => {
      if (probeArmed.get() && previous !== null && current !== previous) {
        runOnJS(emitScrollOffset)(current);
      }
    },
  );

  useAnimatedReaction(
    () => freeze.get(),
    (current, previous) => {
      if (probeArmed.get() && previous !== null && current !== previous) {
        runOnJS(emitFreeze)(current);
      }
    },
  );

  useKeyboardProbe();

  useLayoutEffect(() => {
    tailFollowPhaseRef.current = tailFollowPhase;
    // anchoring 与 following 都由 app 主动把列表推向底部（钉顶滚动 / 尾随滚动），
    // 只有 paused 全程不自动滚。没有锚点时不存在任何自动滚动，交回 isAtEnd 单独判定。
    isTailControlled.set(hasAnchor && tailFollowPhase !== 'paused');
    // 相位决定同一条位移轨迹该被判成合格还是缺陷（钉顶期应静止、尾随期应跟随），
    // 所以它必须作为独立信号进日志，否则 harness 无从判定。
    emitLayoutBenchProbe('phase', { anchorId: anchorMessageId, phase: tailFollowPhase });
  }, [anchorMessageId, hasAnchor, isTailControlled, tailFollowPhase]);

  // Read from size and layout callbacks, which the platform dispatches well
  // after commit, so mirroring the staged anchor here is soon enough.
  useLayoutEffect(() => {
    stagedFirstAnchorIdRef.current = isStagingFirstAnchor ? anchorMessageId : undefined;
  }, [anchorMessageId, isStagingFirstAnchor]);

  // LegendList 的 maintainScrollAtEnd 会在 rAF 中捕获旧配置，拖动已暂停后仍可能执行一次。
  // 在应用层合并 follow 请求，并在直接派发给原生 ScrollView 前重新检查同步交互锁。
  const cancelPendingTailFollow = useCallback(() => {
    if (pendingTailFollowFrameRef.current !== null) {
      cancelAnimationFrame(pendingTailFollowFrameRef.current);
      pendingTailFollowFrameRef.current = null;
    }
  }, []);

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
      emitProgrammaticScroll('tailFollow', listRef);
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
        // 收键盘与钉顶滚动同时发起，别试着把它挪到滚动之后：实测「先钉顶、动画结束再收
        // 键盘」会把位移搬到动画终点、还要再被尾随滚动拉一次，反转从 1 处 310px 变 2 处
        // 334px，更差。
        //
        // 这一句能安全地和钉顶同帧，前提是 patches/ 里那个键盘补丁。收键盘时
        // react-native-keyboard-controller 默认按**键盘抬起那一刻记录的抬升量**回退，而
        // 发送恰好在两次键盘事件之间把钉顶预留空白从 0 顶到 512、可滚动末端跟着下移，
        // 回退的前提已经不成立——补丁前这里有一帧 -310px 的突跳，动画因此走 616px 而非
        // 306px。补丁改成「夹到当下的合法区间」。补丁掉了这个跳动就会回来。
        void scrollMessageToEnd({
          animated: shouldAnimate,
          closeKeyboard: isEnteringMessage,
        });
      });
    },
    [animateFirstEnteringMessage, anchorIndex, enteringMessageId, scrollMessageToEnd],
  );

  const handleAnchoredEndSpaceSizeChanged = useCallback(
    (size: number) => {
      emitLayoutBenchProbe('endSpace', { size: Math.round(size) });

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

  const handleItemSizeChanged = useCallback(
    (info: { index: number; itemKey: string; previous: number; size: number }) => {
      // 同一行的高度反复变化 = 渲染抖动，是「流式期间内容上下弹」最直接的量化指标。
      emitLayoutBenchProbe('itemSize', {
        index: info.index,
        key: info.itemKey,
        prev: Math.round(info.previous),
        size: Math.round(info.size),
      });
      releaseStagedFirstAnchor();
      scheduleTailFollow();
    },
    [releaseStagedFirstAnchor, scheduleTailFollow],
  );

  // 纯文本按当前字号最多以两行参与锚点计算；文件/图片使用完整实测高度，避免媒体被顶出屏幕。
  const anchoredEndSpace = useMemo(
    () =>
      hasAnchor && !isStagingFirstAnchor
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
      isStagingFirstAnchor,
    ],
  );

  const maintainVisibleContentPosition = isFollowing
    ? followingMaintainVisibleContentPosition
    : MAINTAIN_VISIBLE_CONTENT_POSITION;
  // 把列表「是否精确在最底部」同步到共享值，驱动悬浮的「滚动到底部」按钮显隐。
  const sharedValues = useMemo(
    () => ({ isAtEnd: isAtBottom, scrollOffset }),
    [isAtBottom, scrollOffset],
  );
  const handleScrollToEnd = useCallback(() => {
    emitProgrammaticScroll('button', listRef);
    void listRef.current?.scrollToEnd({ animated: true });
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

        // 本 effect 依赖 contentBaseHeight，而流式每来一个 chunk 内容高度就变一次 → 静默窗口
        // 反复重启、gate 在整段流式里每帧重跑，这个 scrollToEnd 于是变成第二条不受尾随状态机
        // 管的自动滚动。它必须和 scheduleTailFollow 守同一个不变式：用户手上有动作时一律不滚，
        // 否则拖动过程中列表会被硬拽回底部（实测一次拖动被拽 +198px，harness 的
        // gesture-conflict 判据就是这么抓到的）。
        // 跳过滚动但照常进入 settle：遮罩存在的意义是挡住布局抖动，人都已经在拖了就别再挡着。
        if (shouldScrollToEndBeforeReady && !isUserInteractingRef.current) {
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
    lastMessageId,
    listRef,
    viewportHeight,
  ]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      cancelPendingInteractionEnd();
      if (pendingFirstAnchorReleaseFrameRef.current !== null) {
        cancelAnimationFrame(pendingFirstAnchorReleaseFrameRef.current);
        pendingFirstAnchorReleaseFrameRef.current = null;
      }
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
            alignItemsAtEnd={isStagingFirstAnchor}
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
            maintainVisibleContentPosition={maintainVisibleContentPosition}
            onContentSizeChange={handleContentSizeChange}
            onEndVisible={handleEndVisible}
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
            isHidden={isScrollButtonHidden}
            onPress={handleScrollToEnd}
          />
        ) : null}
      </View>
    </MessageSlideInProvider>
  );
}
