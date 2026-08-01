import { ActivityIndicator } from 'react-native';
import Animated, { Easing, FadeOut } from 'react-native-reanimated';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

type ChatInitialRenderCoverProps = {
  isVisible: boolean;
};

export function ChatInitialRenderCover({ isVisible }: ChatInitialRenderCoverProps) {
  const [backgroundColor, indicatorColor] = useThemeColor(['background', 'muted-foreground']);

  if (!isVisible) {
    return null;
  }

  // 盖满 workspace，避免消息尾行从遮罩与输入框之间漏出；浮动输入框的 z-10 仍在遮罩之上。
  // 新列表在遮罩后完成布局，进度指示器提供即时反馈，二者准备好后再一起淡出。
  return (
    <Animated.View
      className="absolute inset-0 items-center justify-center"
      exiting={FadeOut.duration(180).easing(Easing.out(Easing.cubic))}
      pointerEvents="none"
      style={{ backgroundColor, zIndex: 5 }}
    >
      <ActivityIndicator color={indicatorColor} size="small" />
    </Animated.View>
  );
}
