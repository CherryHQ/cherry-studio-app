import { useAnimatedStyle } from 'react-native-reanimated';

import { useMessageSlideInFlightContext } from './MessageSlideInProvider';

/**
 * 刚发送的用户气泡的入场位移：从输入框上缘飞到钉顶落点。距离与开火时机都由列表持有的飞行
 * 决定（见 useMessageSlideInFlight），这里只负责把它读成 transform。
 *
 * 没有淡入。曾经这里是纯 fade，理由是「钉顶瞬时定位，消息一出现就在终点，再叠纵向运动会
 * 读成抖一下」——那个前提已经不成立：位移现在**就是**这段 transform，钉顶只负责把行的布局
 * 位置放到终点。再补一层 opacity 只会让飞行的前几帧发虚；逐帧取证参照实现也确认气泡从第一
 * 帧起就是满色满宽。
 */
export function useUserMessageSlideInStyle(messageId: string) {
  const flight = useMessageSlideInFlightContext();
  const activeMessageId = flight?.activeMessageId;
  const offset = flight?.offset;

  return useAnimatedStyle(() => ({
    transform: [{ translateY: offset && activeMessageId?.get() === messageId ? offset.get() : 0 }],
  }));
}
