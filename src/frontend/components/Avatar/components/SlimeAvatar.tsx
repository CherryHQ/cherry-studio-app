import { useId } from 'react';
import Svg, { Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';

import type { SlimeAvatarParts } from '@/shared/data/types/agentAvatar';

import {
  SLIME_EYE_COLOR,
  SLIME_EYES,
  SLIME_PALETTES,
  SLIME_SHAPES,
} from '../utils/slimeAvatarArtwork';

export function SlimeAvatar({ parts, size }: { parts: SlimeAvatarParts; size: number }) {
  const gradientId = `slime-${useId().replace(/:/g, '')}`;
  const shape = SLIME_SHAPES[parts.shape];
  const palette = SLIME_PALETTES[parts.color];

  return (
    <Svg accessible={false} height={size} pointerEvents="none" viewBox="0 0 200 200" width={size}>
      <Defs>
        <RadialGradient cx="30%" cy="14%" id={gradientId} r="85%">
          <Stop offset="0" stopColor={palette.light} />
          <Stop offset="0.5" stopColor={palette.mid} />
          <Stop offset="1" stopColor={palette.base} />
        </RadialGradient>
      </Defs>
      <Path d={shape.path} fill={`url(#${gradientId})`} />
      <G transform={`translate(100 ${shape.eyeY})`}>
        {SLIME_EYES[parts.eyes].map(({ d, strokeWidth }) => (
          <Path
            key={d}
            d={d}
            fill={strokeWidth ? 'none' : SLIME_EYE_COLOR}
            stroke={strokeWidth ? SLIME_EYE_COLOR : 'none'}
            strokeLinecap="round"
            strokeWidth={strokeWidth}
          />
        ))}
      </G>
    </Svg>
  );
}
