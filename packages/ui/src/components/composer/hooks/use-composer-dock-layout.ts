import { useCallback, useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  composerContentGap,
  getComposerKeyboardStickyOffset,
  getComposerMinimumHeight,
} from '../utils/composer-dock-layout';

export function useComposerDockLayout() {
  const { bottom } = useSafeAreaInsets();
  const minimumInputHeight = getComposerMinimumHeight(bottom);
  const keyboardOffset = getComposerKeyboardStickyOffset(bottom);
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
    contentBottomInset: inputHeight + composerContentGap,
    handleInputHeightChange,
    inputHeight,
    inputHeightShared,
    keyboardOffset,
  };
}
