import type { SharedValue } from 'react-native-reanimated';

export type ScrollToBottomButtonProps = {
  // 按钮底边与输入框顶边的间距。
  gap: number;
  // 输入框实测高度共享值：逐帧驱动按钮定位。
  inputHeight: SharedValue<number>;
  // 列表「是否精确在最底部」共享值：true 时按钮淡出并禁用点击。
  isAtBottom: SharedValue<boolean>;
  onPress: () => void;
};
