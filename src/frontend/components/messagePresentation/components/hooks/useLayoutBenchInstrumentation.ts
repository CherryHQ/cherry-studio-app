import { type LegendListRef } from '@legendapp/list/react-native';
import { type RefObject, useEffect } from 'react';
import { KeyboardEvents } from 'react-native-keyboard-controller';
import {
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useSharedValue,
} from 'react-native-reanimated';

import { loggerService } from '@/shared/core/logger/LoggerService';
import { emitLayoutBenchProbe, isLayoutBenchProbeArmed } from '@/shared/devBench/layoutBenchProbe';

// 滚动/布局诊断埋点：记录会驱动列表位移的关键数值（scroll offset、内容高度、锚点就绪、
// 翻页触发、钉顶滚动），用于把「界面跳动」量化成时间-位移轨迹。走 logger.debug → 仅 dev
// 输出（生产环境被日志级别过滤），故长期保留无碍。用 `[SCROLL]` 前缀便于从 Metro 日志过滤。
export const scrollLog = loggerService.withContext('ChatScroll');

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

// 键盘收放挪动内容却不改 contentSize、不改视口，因此不留下任何其它探针能看见的痕迹。发送时
// `scrollMessageToEnd` 正好同时发起收键盘与钉顶滚动，缺了这条时间线就没法判断那一帧的位移
// 是谁造成的。
//
// 一起记下当时的预留空白，是因为键盘造成净位移的充要条件就是它：抬起时按「当时的预留空白
// 能吸收多少」决定抬多少，收起时回退的是抬起那一刻记下来的量——**两次之间预留空白变了，
// 回退量就不再对**（实测续轮发送 0 → 512，净位移 310px）。没有这两个数，这类位移只能靠
// 猜（上一轮就据此错误地怀疑过 MVCP）。
//
// 订阅不能按 `isLayoutBenchProbeArmed()` 开关：探针由假模型在**第一次发送**时 arm，而这个
// effect 在列表挂载时就跑完了，按 armed 判断等于永远不订阅（实测整轮零 keyboard 事件）。
// 改成 dev 下常驻订阅、由 emit 自己按 armed 过滤——键盘事件只在收放时各一条，不像 onScroll
// 那样每帧都有，常驻的代价可以忽略。
function useKeyboardProbe(endSpaceRef: RefObject<number>) {
  useEffect(() => {
    if (!__DEV__) {
      return;
    }

    const subscriptions = (['keyboardWillShow', 'keyboardWillHide'] as const).map((event) =>
      KeyboardEvents.addListener(event, ({ duration, height }) => {
        emitLayoutBenchProbe('keyboard', {
          dur: duration,
          endSpace: Math.round(endSpaceRef.current),
          event,
          h: Math.round(height),
        });
      }),
    );

    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [endSpaceRef]);
}

// 程序化滚动只记「谁调的」不够：同一个 scrollToEnd 落到哪里，取决于调用瞬间列表认为的
// 内容长度与视口长度。发送消息时这两个量正在剧烈变化（新行未测量、预留空白在重算），
// 落点因此可能远离用户当前位置——把三个量与调用点一起记下才谈得上归因。
export function emitProgrammaticScroll(
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

// layout-bench 探针的常驻副作用：把只在 UI 线程可见的信号（滚动 offset、按钮显隐、freeze）
// 回抛到 JS 侧的探针通道，并订阅键盘时间线。生产环境下 emit 未 arm 即早退、键盘订阅整个
// 跳过，成本接近零。信息发生在业务回调体内的那几处（anchorReady/readyGate 的
// emitProgrammaticScroll、onSizeChanged 里的 endSpace 上报）留在调用现场，搬不进来。
export function useLayoutBenchInstrumentation({
  endSpaceRef,
  freeze,
  isAtBottom,
  scrollOffset,
}: {
  endSpaceRef: RefObject<number>;
  freeze: SharedValue<boolean>;
  isAtBottom: SharedValue<boolean>;
  scrollOffset: SharedValue<number>;
}) {
  // arm 发生在假模型被构造时（晚于本组件挂载），worklet 读不到 JS 侧的模块变量，
  // 因此每次渲染把 arm 状态同步进 shared value，未 arm 时连 runOnJS 都不发生。
  const probeArmed = useSharedValue(false);

  useEffect(() => {
    probeArmed.set(isLayoutBenchProbeArmed());
  });

  useAnimatedReaction(
    () => isAtBottom.get(),
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

  useKeyboardProbe(endSpaceRef);
}
