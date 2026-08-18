import { spring } from '@cherrystudio/ui/motion';
import { useCallback, useLayoutEffect, useRef } from 'react';
import {
  ReduceMotion,
  runOnJS,
  type SharedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { emitLayoutBenchProbe } from '@/shared/devBench/layoutBenchProbe';

function emitSlideInSettled(isFinished: boolean) {
  emitLayoutBenchProbe('slideIn', { finished: isFinished, phase: 'settle' });
}

export type MessageSlideInFlight = {
  // 当前这次飞行属于哪条消息。行在 worklet 里比对自己是不是它——同一时刻只有一条消息在飞，
  // 所以偏移量共用一份；靠 id 比对而不是靠行自己记「我该不该飞」，才能在连发时让上一条
  // 立刻脱离（它的行还挂着，若跟着读偏移量就会被新一条的起飞点一起拽下去）。
  //
  // 落地后**不清空**，一直留到下次装填：待发消息落库常常发生在飞行中途，那时清掉会让行
  // 当帧从半空直接跳回落点。留着无害——偏移量此时已收敛到 0。
  activeMessageId: SharedValue<string | undefined>;
  // 入场行相对钉顶落点的纵向偏移（px，正值＝落点下方）。
  offset: SharedValue<number>;
  // 与入场行同一轮的助手占位行。它要等用户消息落位后才显形，否则「思考中」会在气泡还在半空
  // 时先出现在气泡**上方**——助手行的布局位置紧挨用户行的落点，而用户行此刻只是被 transform
  // 拉下去了，两者读起来是颠倒的。
  followerMessageId: SharedValue<string | undefined>;
  // 归一化的落位进度（0＝刚起飞，1＝已落位），跑的是与 offset 同一条弹簧。用它而不是直接读
  // offset：offset 的量纲是像素、上限随「滚动分走多少」变化，而这个值恒为 0→1，跟随行的真实
  // 到达节奏，与行程怎么拆无关。
  landingProgress: SharedValue<number>;
  // 在钉顶落位的同一帧调用，开始向落点收敛。`pendingScrollPx` 是这一帧起列表还会自己滚掉的
  // 距离——那一段由滚动动画承担，弹簧只走剩下的。
  launch: (pendingScrollPx: number) => void;
};

/**
 * 刚发送的用户消息「从输入框飞到钉顶落点」的入场动画。
 *
 * 可见行程由两段拼成，加起来恒等于 `travel`：钉顶滚动把旧内容送出视口、顺带把行抬高
 * `pendingScrollPx`，剩下的由这里的弹簧走。**不能**让两段都走全程——那是双倍距离；也不能
 * 为了避开双倍就把滚动改成瞬时——旧内容会一帧切掉（见 useMessageListAnchorPin 的说明）。
 *
 * 这样拆的收益是**第一条消息和后续消息走同一条路径**：新建话题里内容不足一屏、可滚动距离
 * 恒为 0，于是弹簧独扛全程；那正是「第一条没有入场动画」的根因——旧实现把入场完全押在滚动
 * 动画上，而没有可滚动距离的话，滚动动画演不出任何东西。
 *
 * transform 不参与布局，所以行飞过的那段路不需要真实存在——而它恰好是钉顶预留的空白
 * （`anchoredEndSpace` 留出的正是「让新行贴到顶」所需的高度）。逐帧录像确认途中无内容可遮，
 * 只有回复已开始流式、行却还没收敛完的最后几十毫秒会短暂压住回复首行。
 *
 * 参照实现（ChatGPT）走的是另一条路：独立于列表的覆盖层，飞行途中实打实地遮住上一条回复的
 * 正文，落地时再把位置交接给真实行；实测在飞行中上滑打断会交接错位、硬跳 455pt。行内
 * transform 没有交接这一步，用户中途拖动时行跟着内容走、残余偏移继续收敛，结构上不会产生
 * 那一跳。
 */
export function useMessageSlideInFlight({
  enteringMessageId,
  followerMessageId: nextFollowerMessageId,
  travel,
}: {
  enteringMessageId: string | undefined;
  followerMessageId: string | undefined;
  travel: number;
}): MessageSlideInFlight {
  const activeMessageId = useSharedValue<string | undefined>(undefined);
  const followerMessageId = useSharedValue<string | undefined>(undefined);
  const landingProgress = useSharedValue(1);
  const offset = useSharedValue(0);
  const armedMessageIdRef = useRef<string | undefined>(undefined);
  const isLaunchedRef = useRef(false);

  // 起飞点必须在行的**第一帧**就位：钉顶要等测量与 ready-gate 的静默窗口（≥150ms ≈ 9 帧），
  // 这段时间里若偏移量还是 0，新建话题的行会先在落点显形、等 launch 再跳回输入框飞一遍。
  //
  // 起飞前 travel 随布局自由更新（键盘高度、输入框行数、字号都会改它）；起飞后不再跟随，
  // 否则会把正在收敛的弹簧拽回去。
  useLayoutEffect(() => {
    if (enteringMessageId === undefined) {
      return;
    }

    if (armedMessageIdRef.current === enteringMessageId) {
      if (!isLaunchedRef.current) {
        offset.set(travel);
      }

      return;
    }

    armedMessageIdRef.current = enteringMessageId;
    isLaunchedRef.current = false;
    activeMessageId.set(enteringMessageId);
    followerMessageId.set(nextFollowerMessageId);
    landingProgress.set(0);
    offset.set(travel);
    emitLayoutBenchProbe('slideIn', { phase: 'arm', travel: Math.round(travel) });
  }, [
    activeMessageId,
    enteringMessageId,
    followerMessageId,
    landingProgress,
    nextFollowerMessageId,
    offset,
    travel,
  ]);

  // 开火只看「装填了没有、开过没有」，不看当前的 enteringMessageId：待发消息一落库它就被
  // 清空，而那常常发生在飞行**中途**。若拿它当判据，清空之后到达的那次落位会被误判成
  // 「已开火」而直接返回，行就永久停在半空。
  //
  // 也不校验落位的是不是入场行：任何一次锚点落位都让已装填的飞行开始收敛。早收敛只是动画
  // 早播一点，等不到自己那次落位却是把行留在半空。
  const launch = useCallback(
    (pendingScrollPx: number) => {
      if (armedMessageIdRef.current === undefined || isLaunchedRef.current) {
        return;
      }

      isLaunchedRef.current = true;
      // 装填时行还停在「滚动尚未发生」的布局位置上，偏移量按全程给，所以它此刻在输入框**之下**、
      // 被输入框挡着看不见。开火这一帧把这段滚动从偏移量里扣掉，行正好显形在输入框上缘，随后
      // 滚动与弹簧各走各的一段。
      //
      // 起飞距离直接读 `offset`，不另存一份：装填 effect 每次都把它设成当前的 travel，弹簧要到
      // 下一行才开始跑，所以此刻它就是这次装填的全程。
      const armedTravel = offset.get();
      const springTravel = Math.max(0, armedTravel - pendingScrollPx);
      emitLayoutBenchProbe('slideIn', {
        phase: 'launch',
        scroll: Math.round(pendingScrollPx),
        travel: Math.round(armedTravel),
      });
      offset.set(springTravel);
      offset.set(
        withSpring(0, { ...spring.settle, reduceMotion: ReduceMotion.System }, (isFinished) => {
          'worklet';

          runOnJS(emitSlideInSettled)(isFinished === true);
        }),
      );
      // 同一条弹簧、同一时刻起跑，所以它与行的到达严格同步，不必再猜一个延迟常量。
      landingProgress.set(withSpring(1, { ...spring.settle, reduceMotion: ReduceMotion.System }));
    },
    [landingProgress, offset],
  );

  return { activeMessageId, followerMessageId, landingProgress, launch, offset };
}
