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
  const composerInset = useComposerExpansion()?.meta.contentInset;
  const { height: keyboardHeight, progress: keyboardProgress } = useReanimatedKeyboardAnimation();
  const keyboardOffset = getComposerKeyboardStickyOffset(useSafeAreaInsets().bottom);
  // Centered content rises by half the keyboard lift, matching padding without a relayout per frame.
  const style = useAnimatedStyle(() => ({
    paddingBottom: contentBottomInset + (composerInset?.get() ?? 0),
    transform: [
      {
        translateY: Math.min(0, keyboardHeight.get() + keyboardProgress.get() * keyboardOffset) / 2,
      },
    ],
  }));

  return (
    <Animated.View className={className} style={style}>
      {children}
    </Animated.View>
  );
}
