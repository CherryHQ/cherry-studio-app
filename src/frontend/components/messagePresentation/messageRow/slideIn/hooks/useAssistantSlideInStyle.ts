import { Extrapolation, interpolate, useAnimatedStyle } from 'react-native-reanimated';

import { useMessageSlideInFlightContext } from '../MessageSlideInProvider';

// 在落位进度的哪一段淡入。助手行紧挨用户行的落点，所以只要用户行还在半空，「思考中」就会
// 出现在气泡**上方**——顺序读起来是颠倒的。等到 0.7 之后再露面，此刻行已走完约九成距离、
// 视觉上已经在落点了，淡入与最后一点收敛重叠，不会读成「等了一下才出现」。
const FADE_IN_FROM = 0.7;
const FADE_IN_TO = 0.95;

/**
 * 与入场用户消息同一轮的助手占位行的显形时机。
 *
 * 只改 opacity **不改布局**：这一行必须从一开始就占住它的高度，否则 LegendList 算不出锚点
 * 下方的预留空白、`onReady` 也就等不到「锚点下方全部测量完毕」，钉顶落点会跟着错。
 */
export function useAssistantSlideInStyle(messageId: string) {
  const flight = useMessageSlideInFlightContext();
  const followerMessageId = flight?.followerMessageId;
  const landingProgress = flight?.landingProgress;

  return useAnimatedStyle(() => {
    if (!followerMessageId || !landingProgress || followerMessageId.get() !== messageId) {
      return { opacity: 1 };
    }

    return {
      opacity: interpolate(
        landingProgress.get(),
        [FADE_IN_FROM, FADE_IN_TO],
        [0, 1],
        Extrapolation.CLAMP,
      ),
    };
  });
}
