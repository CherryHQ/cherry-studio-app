import type { SharedValue } from 'react-native-reanimated';

export type ScrollToBottomButtonProps = {
  // 按钮底边与输入框顶边的间距。
  gap: number;
  // 输入框实测高度共享值：逐帧驱动按钮定位。
  inputHeight: SharedValue<number>;
  // 是否在列表底部：true 时淡出并禁用点击。
  isAtBottom: boolean;
  onPress: () => void;
};
