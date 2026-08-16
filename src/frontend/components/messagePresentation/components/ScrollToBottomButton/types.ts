import type { SharedValue } from 'react-native-reanimated';

export type ScrollToBottomButtonProps = {
  // 按钮底边与输入框顶边的间距。
  gap: number;
  // 输入框实测高度共享值：逐帧驱动按钮定位。
  inputHeight: SharedValue<number>;
  // 按钮是否应当隐藏：true 时淡出并禁用点击。
  // 刻意不叫 isAtBottom——「是否在最底部」不足以决定显隐，见 MessageList 的推导注释。
  isHidden: SharedValue<boolean>;
  onPress: () => void;
};
