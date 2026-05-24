import { useCallback, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { chatInputMessageListGap, getChatInputMinimumHeight } from '../../input/chatInputLayout';

export function useFloatingChatInputLayout() {
  const { bottom } = useSafeAreaInsets();
  const minimumInputHeight = getChatInputMinimumHeight(bottom);
  const [measuredInputHeight, setMeasuredInputHeight] = useState(0);
  const inputHeight = Math.max(measuredInputHeight, minimumInputHeight);

  const handleInputHeightChange = useCallback((nextHeight: number) => {
    const roundedHeight = Math.ceil(nextHeight);

    setMeasuredInputHeight((currentHeight) =>
      currentHeight === roundedHeight ? currentHeight : roundedHeight,
    );
  }, []);

  return {
    contentBottomInset: inputHeight + chatInputMessageListGap,
    handleInputHeightChange,
    inputHeight,
  };
}
