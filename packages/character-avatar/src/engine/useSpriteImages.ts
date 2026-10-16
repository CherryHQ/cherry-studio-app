import { type SkImage, useImage } from '@shopify/react-native-skia';
import { useMemo } from 'react';

import type { CharacterExpression, CharacterLayers } from './types';

export type SpriteImages = {
  expressions: Record<CharacterExpression, SkImage>;
  tuft: SkImage | null;
};

/** Decodes every layer of a sprite; null until all requested layers are ready. */
export function useSpriteImages(layers: CharacterLayers): SpriteImages | null {
  const { expressions } = layers;
  const idle = useImage(expressions.idle);
  const blink = useImage(expressions.blink);
  const thinking = useImage(expressions.thinking);
  const waiting = useImage(expressions.waiting);
  const done = useImage(expressions.done);
  const error = useImage(expressions.error);
  const tuft = useImage(layers.tuft ?? null);
  return useMemo(() => {
    if (!idle || !blink || !thinking || !waiting || !done || !error) return null;
    if (layers.tuft && !tuft) return null;
    return {
      expressions: { idle, blink, thinking, waiting, done, error },
      tuft: tuft ?? null,
    };
  }, [blink, done, error, idle, layers.tuft, thinking, tuft, waiting]);
}
