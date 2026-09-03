import { BlurView } from 'expo-blur';
import { View } from 'react-native';
import { useUniwind } from 'uniwind';

import type { SidebarFadeProps } from './SidebarFade.types';

// Stacked bands, each anchored to the fade's edge and shorter than the last, so
// blur passes accumulate toward that edge. Deliberately NOT a gradient-masked
// blur: `CALayer.mask` forces offscreen rendering, and a `UIVisualEffectView`
// inside one samples an empty backdrop instead of the rows behind it.
const bandHeightRatios = [1, 0.72, 0.46, 0.22];
const bandIntensity = 9;

/**
 * Progressive blur over the sidebar's scroller: rows genuinely blur as they
 * approach the edge, rather than only losing opacity. Dissolving them into the
 * sidebar surface is `ScrollShadow`'s job, one layer below.
 */
export function SidebarFade({ edge, size }: SidebarFadeProps) {
  const { theme } = useUniwind();

  return (
    <View pointerEvents="none" style={{ height: size }}>
      {bandHeightRatios.map((ratio) => (
        <BlurView
          key={ratio}
          intensity={bandIntensity}
          tint={theme === 'dark' ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'}
          style={{
            height: size * ratio,
            left: 0,
            position: 'absolute',
            right: 0,
            ...(edge === 'top' ? { top: 0 } : { bottom: 0 }),
          }}
        />
      ))}
    </View>
  );
}
