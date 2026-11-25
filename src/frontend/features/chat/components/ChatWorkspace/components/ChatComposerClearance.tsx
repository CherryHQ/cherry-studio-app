import { getComposerKeyboardStickyOffset, useComposerExpansion } from '@cherrystudio/ui/components';
import type { PropsWithChildren } from 'react';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ChatComposerClearanceProps = PropsWithChildren<{
  className?: string;
  /** Space kept above the floating composer's compact height. */
  contentBottomInset?: number;
}>;

/** A centered state that stays above the floating composer without rerendering as it resizes. */
export function ChatComposerClearance({
  children,
  className,
  contentBottomInset = 0,
}: ChatComposerClearanceProps) {
  const composer = useComposerExpansion()?.meta;
  const composerInset = composer?.contentInset;
  const dockLift = composer?.dockLift;
  const liveDockHeight = composer?.compactDockHeight;
  const { height: keyboardHeight, progress: keyboardProgress } = useReanimatedKeyboardAnimation();
  const keyboardOffset = getComposerKeyboardStickyOffset(useSafeAreaInsets().bottom);
  // Match the live dock top while holding layout padding steady through the editor morph.
  const style = useAnimatedStyle(() => {
    const settledHeight = composerInset?.get() ?? 0;
    const lift =
      dockLift?.get() ??
      Math.max(0, -keyboardHeight.get() - keyboardProgress.get() * keyboardOffset);
    const heightDelta = (liveDockHeight?.get() ?? settledHeight) - settledHeight;
    return {
      paddingBottom: contentBottomInset + settledHeight,
      transform: [{ translateY: -(lift + heightDelta) / 2 }],
    };
  });

  return (
    <Animated.View className={className} style={style}>
      {children}
    </Animated.View>
  );
}
