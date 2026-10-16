import type { CharacterSprite } from '@cherrystudio/character-avatar';
import { CHARACTER_EXPRESSIONS } from '@cherrystudio/character-avatar/manifest';

import type { AvatarCharacter } from '@/shared/contracts/avatars';

/** Adapts a library character to the engine. */
export function characterSprite({ manifest, layers }: AvatarCharacter): CharacterSprite {
  const expressions = Object.fromEntries(
    CHARACTER_EXPRESSIONS.map((expression) => [expression, layers[expression]]),
  ) as CharacterSprite['layers']['expressions'];
  return {
    rig: { size: manifest.size, ...manifest.rig },
    layers: { expressions, tuft: manifest.rig.tuft ? layers.tuft : undefined },
  };
}
