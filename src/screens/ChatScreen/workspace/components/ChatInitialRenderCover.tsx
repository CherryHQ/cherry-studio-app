import { useThemeColor } from 'heroui-native/hooks';
import Animated, { FadeOut } from 'react-native-reanimated';

type ChatInitialRenderCoverProps = {
  isVisible: boolean;
};

export function ChatInitialRenderCover({ isVisible }: ChatInitialRenderCoverProps) {
  const backgroundColor = useThemeColor('background');

  if (!isVisible) {
    return null;
  }

  // 盖满整屏（含浮动输入框那条区域）。此前用 bottom: bottomInset 特意漏出底部输入框，
  // 但列表滚到底后「消息尾行」正好落在「遮罩下边缘 ↔ 输入框顶部」的缝里露出来 → 揭示时整块
  // 上跳。冷 markdown 期间输入框本就是空的，整屏盖住再随内容一起淡出，堵住这条缝、消除尾行闪现。
  return (
    <Animated.View
      className="absolute inset-0"
      exiting={FadeOut.duration(100)}
      pointerEvents="none"
      style={{ backgroundColor, zIndex: 5 }}
    />
  );
}
