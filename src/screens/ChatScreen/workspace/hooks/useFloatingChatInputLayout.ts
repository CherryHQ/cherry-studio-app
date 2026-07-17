import { useCallback, useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { chatInputMessageListGap, getChatInputMinimumHeight } from '../../input/chatInputLayout';

export function useFloatingChatInputLayout() {
  const { bottom } = useSafeAreaInsets();
  const minimumInputHeight = getChatInputMinimumHeight(bottom);
  // 逐帧裸高度走共享值（驱动悬浮按钮定位），离散 clamp 高度走 state（驱动列表 padding）：
  // clamp 后同值不变，命中 React eager bail-out，避免逐帧 onLayout 重渲染整个 ChatWorkspace。
  const inputHeightShared = useSharedValue(minimumInputHeight);
  const [clampedInputHeight, setClampedInputHeight] = useState(minimumInputHeight);
  const inputHeight = Math.max(clampedInputHeight, minimumInputHeight);

  const handleInputHeightChange = useCallback(
    (nextHeight: number) => {
      inputHeightShared.set(nextHeight);

      const nextClampedHeight = Math.max(Math.ceil(nextHeight), minimumInputHeight);

      setClampedInputHeight((current) =>
        current === nextClampedHeight ? current : nextClampedHeight,
      );
    },
    [inputHeightShared, minimumInputHeight],
  );

  return {
    contentBottomInset: inputHeight + chatInputMessageListGap,
    handleInputHeightChange,
    inputHeight,
    inputHeightShared,
  };
}
