import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import { storageDirectory } from '@/backend/data/storage/storagePaths';
import type { AvatarsModule } from '@/shared/contracts/avatars';
import { loggerService } from '@/shared/core/logger/LoggerService';
import {
  AvatarRecipeSchema,
  AvatarResourceSchema,
  AvatarSourceSchema,
} from '@/shared/data/types/avatar';

const logger = loggerService.withContext('AvatarResources');
const AVATAR_RESOURCE_DIRECTORY = 'avatar-resources';
const MAX_AVATAR_RESOURCE_BYTES = 16 * 1024;
const MAX_AVATAR_PNG_LENGTH = 3 * 1024 * 1024;
const AVATAR_PNG_PATTERN = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;

export type AvatarResources = Pick<AvatarsModule, 'createDraft' | 'resolve'> & {
  /** Copies a resource so each owner has an independent lifecycle. */
  persist(source: string): Promise<string>;
  remove(reference: string): Promise<void>;
};

/** Recipes and covers live together; drafts stay in cache until the owning workflow saves them. */
export function createAvatarResources(): AvatarResources {
  const files = (source: string) => {
    AvatarSourceSchema.parse(source);
    const draft = source.startsWith('avatar-draft:');
    const id = source.slice(source.indexOf(':') + 1);
    const directory = new Directory(
      draft ? Paths.cache : storageDirectory(),
      AVATAR_RESOURCE_DIRECTORY,
    );
    return {
      directory,
      recipe: new File(directory, `${id}.json`),
      cover: new File(directory, `${id}.png`),
    };
  };
  const remove = async (reference: string) => {
    const { recipe, cover } = files(reference);
    // Try both even if one delete fails; callers report failures without losing the committed avatar.
    const failures = await Promise.allSettled(
      [recipe, cover].map(async (file) => {
        if (file.exists) file.delete();
      }),
    );
    for (const result of failures) if (result.status === 'rejected') throw result.reason;
  };
  const cleanFailedWrite = async (reference: string) => {
    try {
      await remove(reference);
    } catch (error) {
      logger.warn('Failed to remove an incomplete avatar resource', error as Error);
    }
  };
  const readRecipe = async (recipe: File) => {
    try {
      return AvatarResourceSchema.parse(JSON.parse(await recipe.text())).recipe;
    } catch (error) {
      // The cover still identifies the avatar; only animation and re-editing are lost.
      logger.warn('Failed to read an avatar recipe', error as Error);
      return null;
    }
  };
  const resolve: AvatarsModule['resolve'] = async (source) => {
    if (!AvatarSourceSchema.safeParse(source).success) return null;
    const { recipe, cover } = files(source);
    if (!cover.exists || cover.size > MAX_AVATAR_PNG_LENGTH) return null;
    const readable = recipe.exists && recipe.size <= MAX_AVATAR_RESOURCE_BYTES;
    return { recipe: readable ? await readRecipe(recipe) : null, coverUri: cover.uri };
  };

  return {
    resolve,
    remove,
    async createDraft(input) {
      const recipe = AvatarRecipeSchema.parse(input.recipe);
      if (input.png.length > MAX_AVATAR_PNG_LENGTH || !AVATAR_PNG_PATTERN.test(input.png)) {
        throw new Error('Avatar cover must be a bounded PNG data URL');
      }
      const reference = `avatar-draft:${randomUUID()}`;
      const target = files(reference);
      try {
        target.directory.create({ intermediates: true, idempotent: true });
        target.cover.create();
        target.cover.write(input.png.slice(input.png.indexOf(',') + 1), { encoding: 'base64' });
        target.recipe.create();
        target.recipe.write(JSON.stringify({ version: 1, kind: 'character', recipe }));
        return reference;
      } catch (error) {
        await cleanFailedWrite(reference);
        throw error;
      }
    },
    async persist(source) {
      if (!(await resolve(source))) throw new Error('Avatar resource is unavailable');
      const origin = files(source);
      const reference = `avatar-resource:${randomUUID()}`;
      const target = files(reference);
      try {
        target.directory.create({ intermediates: true, idempotent: true });
        await origin.cover.copy(target.cover);
        // Copied verbatim: a recipe this app cannot read may still be readable by a newer one.
        if (origin.recipe.exists) await origin.recipe.copy(target.recipe);
        return reference;
      } catch (error) {
        await cleanFailedWrite(reference);
        throw error;
      }
    },
  };
}
