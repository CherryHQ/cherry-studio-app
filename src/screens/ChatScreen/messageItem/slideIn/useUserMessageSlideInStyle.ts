import { useEffect } from 'react';
import {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

// 刚发送的用户气泡的入场动画：纯淡入（fade），不含纵向位移。
//
// 为什么只有 fade、没有 translateY：钉顶采用「测量就绪后 animated:false 瞬时定位」
// （见 ChatMessageList 的 handleAnchorReady），消息一出现就已落在顶部终点。若再叠一个
// translateY 上移动画，就是与「已定位」相冲突的第二段纵向运动，读起来像抖一下——正是
// 用户反馈的 pin 前抖动来源之一。fade 是纯 opacity、不碰布局也不产生纵向位移，是与瞬时
// 定位共存的、最干净的入场（对齐 v0 / ChatGPT：消息直接出现在顶部，配一个轻淡入）。
//
// 仍用自驱动 useAnimatedStyle 而非 reanimated 的 `entering`：`entering` 在虚拟列表里 mount 时
// 会先以自然态（opacity 1）渲染一帧、下一帧才套 initialValues → 出现「满不透明闪一下再淡入」
// 的闪帧。自驱动方案首帧就同步把 opacity 读成 shared value 初值 0，从第 0 帧起即透明，无闪帧。
const FADE_IN_DURATION = 220;

export function useUserMessageSlideInStyle(shouldSlideIn: boolean) {
  // 初值决定首帧：应播时从「透明」开始，首帧同步套用 → 无「满不透明闪一下」。不播则直接是终态。
  const opacity = useSharedValue(shouldSlideIn ? 0 : 1);

  useEffect(() => {
    if (!shouldSlideIn) {
      return;
    }

    opacity.value = withTiming(1, {
      duration: FADE_IN_DURATION,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    });
  }, [opacity, shouldSlideIn]);

  return useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));
}
