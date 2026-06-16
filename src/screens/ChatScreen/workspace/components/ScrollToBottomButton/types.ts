import type { SharedValue } from 'react-native-reanimated';

export type ScrollToBottomButtonProps = {
  // 按钮底边距屏幕底的距离（由 ChatWorkspace 按输入框实测高度算出）。
  bottomInset: number;
  // 列表「是否精确在最底部」共享值：true 时按钮淡出并禁用点击。
  isAtBottom: SharedValue<boolean>;
  onPress: () => void;
};
