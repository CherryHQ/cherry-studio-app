import { useDrawerProgress } from 'expo-router/drawer';
import { Extrapolation, interpolate, useAnimatedStyle } from 'react-native-reanimated';

import { appSidebar } from '@/frontend/utils/constants';

// The surface slides away on its own; what makes the reveal read as depth is the
// sidebar catching up from slightly below and behind. A worklet rather than a
// second `useAnimatedStyle`, because an animated style's `transform` can't be
// read back on the JS thread.
function revealTransform(progress: number) {
  'worklet';

  return [
    {
      translateY: interpolate(progress, [0, 1], [appSidebar.revealOffsetY, 0], Extrapolation.CLAMP),
    },
    { scale: interpolate(progress, [0, 1], [appSidebar.revealScale, 1], Extrapolation.CLAMP) },
  ];
}

// One transform plane for the whole sidebar, applied once by the root so every
// slot — dock included — moves as a single sheet and the scale keeps a single
// center.
export function useSidebarPlaneStyle() {
  const progress = useDrawerProgress();

  return useAnimatedStyle(() => ({ transform: revealTransform(progress.value) }));
}

// Fade for the header and body only: the dock staying opaque keeps one fixed
// anchor for the eye through the whole drag.
export function useSidebarFadeStyle() {
  const progress = useDrawerProgress();

  return useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [0, appSidebar.revealFadeStart, 1],
      [0, 0, 1],
      Extrapolation.CLAMP,
    ),
  }));
}
