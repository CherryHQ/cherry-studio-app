import { spring } from '@cherrystudio/ui/motion';
import { useCallback, useLayoutEffect, useRef } from 'react';
import {
  ReduceMotion,
  type SharedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

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
  // 在钉顶落位的同一帧调用，开始向落点收敛。
  launch: () => void;
};

/**
 * 刚发送的用户消息「从输入框飞到钉顶落点」的入场动画。
 *
 * 位移全部由行自身的 transform 提供，钉顶滚动则改成瞬时——两者叠加会走双倍距离。这样做的
 * 副产品是**第一条消息和后续消息终于走同一条路径**：transform 不依赖可滚动距离，而新建话题
 * 里内容不足一屏、可滚动距离恒为 0，正是「第一条没有入场动画」的根因。
 *
 * transform 不参与布局，所以飞行中的气泡会画在上一条回复之上。这不是缺陷，而是这个效果的
 * 来源——参照实现（ChatGPT）飞行途中同样遮住下面的正文。它用的是独立于列表的覆盖层，落地
 * 时把位置交接给真实行；实测在飞行中上滑打断会交接错位、硬跳 455pt。行内 transform 没有
 * 交接这一步，用户中途拖动时行跟着内容走、残余偏移继续收敛，结构上不会产生那一跳。
 */
export function useMessageSlideInFlight({
  enteringMessageId,
  travel,
}: {
  enteringMessageId: string | undefined;
  travel: number;
}): MessageSlideInFlight {
  const activeMessageId = useSharedValue<string | undefined>(undefined);
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
    offset.set(travel);
  }, [activeMessageId, enteringMessageId, offset, travel]);

  // 开火只看「装填了没有、开过没有」，不看当前的 enteringMessageId：待发消息一落库它就被
  // 清空，而那常常发生在飞行**中途**。若拿它当判据，清空之后到达的那次落位会被误判成
  // 「已开火」而直接返回，行就永久停在半空。
  //
  // 也不校验落位的是不是入场行：任何一次锚点落位都让已装填的飞行开始收敛。早收敛只是动画
  // 早播一点，等不到自己那次落位却是把行留在半空。
  const launch = useCallback(() => {
    if (armedMessageIdRef.current === undefined || isLaunchedRef.current) {
      return;
    }

    isLaunchedRef.current = true;
    offset.set(withSpring(0, { ...spring.settle, reduceMotion: ReduceMotion.System }));
  }, [offset]);

  return { activeMessageId, launch, offset };
}
