import type { CharacterManifest } from '@cherrystudio/character-avatar/manifest';

import type { AvatarRecipe, AvatarResource } from '@/shared/data/types/avatar';

import type { AvatarStudioModule } from './avatarStudio';

/** A library character with device-local URIs for each of its layers. */
export type AvatarCharacter = {
  id: string;
  manifest: CharacterManifest;
  /** Layer name (see `characterLayers`) to a readable file URI. */
  layers: Record<string, string>;
};

/**
 * Owns the on-device character library, offline avatar drafts, managed resource files, and
 * device-local cover resolution. The app ships no characters; users bring them.
 */
export interface AvatarsModule {
  readonly studio: AvatarStudioModule;
  /** Returns an opaque source reference. The editor's caller stores only this string. */
  createDraft(input: { recipe: AvatarRecipe; png: string }): Promise<string>;
  /**
   * Reads either a draft or a saved resource. A missing resource resolves to null; a resource
   * whose recipe no longer parses keeps its cover with a null recipe.
   */
  resolve(
    source: string,
  ): Promise<{ recipe: AvatarResource['recipe'] | null; coverUri: string } | null>;
  listCharacters(): Promise<AvatarCharacter[]>;
  /** Validates and stores a character pack ZIP; returns the new character id. */
  importCharacterPack(uri: string): Promise<string>;
  /** Avatars already made from the character keep their covers. */
  removeCharacter(id: string): Promise<void>;
}
