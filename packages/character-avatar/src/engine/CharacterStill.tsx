import {
  Circle,
  FilterMode,
  Group,
  Image,
  MipmapMode,
  rect,
  rrect,
} from '@shopify/react-native-skia';
import type { ReactNode } from 'react';

import type { CharacterExpression, CharacterRig } from './types';
import type { SpriteImages } from './useSpriteImages';

/** Avatars draw large art at 24–220 pt; mipmaps keep heavy downscaling smooth. */
export const CHARACTER_SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.Linear };

/** Maps the rig's frame onto a `size` circle on `background` and clips to it. */
export function CharacterFrame({
  rig,
  background,
  size,
  children,
}: {
  rig: CharacterRig;
  background: string;
  size: number;
  children: ReactNode;
}) {
  const { center, side } = rig.frame;
  return (
    <Group clip={rrect(rect(0, 0, size, size), size / 2, size / 2)}>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} color={background} />
      <Group
        transform={[
          { translateX: size / 2 },
          { translateY: size / 2 },
          { scale: size / side },
          { translateX: -center.x },
          { translateY: -center.y },
        ]}
      >
        {children}
      </Group>
    </Group>
  );
}

/** Motionless artwork: covers, thumbnails and the reduced-motion presentation. */
export function CharacterStill({
  rig,
  images,
  background,
  size,
  expression = 'idle',
}: {
  rig: CharacterRig;
  images: SpriteImages;
  background: string;
  size: number;
  expression?: CharacterExpression;
}) {
  const layer = (image: SpriteImages['tuft']) =>
    image ? (
      <Image
        image={image}
        x={0}
        y={0}
        width={rig.size}
        height={rig.size}
        sampling={CHARACTER_SAMPLING}
      />
    ) : null;
  return (
    <CharacterFrame rig={rig} background={background} size={size}>
      {layer(images.expressions[expression])}
      {layer(images.tuft)}
    </CharacterFrame>
  );
}
