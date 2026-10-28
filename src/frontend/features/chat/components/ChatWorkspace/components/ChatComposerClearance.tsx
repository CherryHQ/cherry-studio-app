import { useComposerExpansion } from '@cherrystudio/ui/components';
import type { PropsWithChildren } from 'react';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

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
  const style = useAnimatedStyle(() => ({
    paddingBottom: contentBottomInset + (composerInset?.get() ?? 0),
  }));

  return (
    <Animated.View className={className} style={style}>
      {children}
    </Animated.View>
  );
}
