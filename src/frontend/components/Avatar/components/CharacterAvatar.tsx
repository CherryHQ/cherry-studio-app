import { type CharacterStatus, CharacterPlayer } from '@cherrystudio/character-avatar';
import { useMemo } from 'react';

import type { AvatarRecipe } from '@/shared/data/types/avatar';

import { useAvatarCharacters } from '../hooks/useAvatarCharacters';
import { characterSprite } from '../utils/characterSprite';

/** Renders a recipe from the library; null while loading or when its character is gone. */
export function CharacterAvatar({
  recipe,
  size,
  status = 'idle',
}: {
  recipe: AvatarRecipe;
  size: number;
  status?: CharacterStatus;
}) {
  const characters = useAvatarCharacters();
  const sprite = useMemo(() => {
    const character = characters.data?.find(({ id }) => id === recipe.character);
    return character ? characterSprite(character) : null;
  }, [characters.data, recipe.character]);
  if (!sprite) return null;
  return (
    <CharacterPlayer
      key={recipe.character}
      sprite={sprite}
      background={recipe.background}
      size={size}
      status={status}
    />
  );
}
