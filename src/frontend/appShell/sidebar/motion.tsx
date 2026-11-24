import { createContext, type PropsWithChildren, use } from 'react';
import {
  type DerivedValue,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
} from 'react-native-reanimated';

import { useSidebarToggle } from './toggle';

const ChromeExitContext = createContext<DerivedValue<number> | null>(null);

/** A permanent column also reports progress 1. Only a temporary drawer covers chat controls. */
export function SidebarOverlayMotionProvider({
  children,
  progress,
}: PropsWithChildren<{ progress: Readonly<SharedValue<number>> }>) {
  const reduced = useReducedMotion();
  const overlay = useSidebarToggle()?.action === 'open';
  const exit = useDerivedValue(() =>
    overlay && !reduced ? Math.min(1, Math.max(0, progress.get() / 0.55)) : 0,
  );
  return <ChromeExitContext value={exit}>{children}</ChromeExitContext>;
}

/** Follows the finger in both directions; keeps the controls mounted and their layout intact. */
export function useSidebarChromeStyle(hidden = false) {
  const exit = use(ChromeExitContext);
  return useAnimatedStyle(() => {
    const fraction = exit?.get() ?? 0;
    return {
      opacity: hidden ? 0 : 1 - fraction,
      transform: [{ translateY: 6 * fraction }],
    };
  });
}
