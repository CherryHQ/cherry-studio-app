import { AvatarCharacterIdSchema } from '@cherrystudio/character-avatar/manifest';
import * as z from 'zod';

const AVATAR_ID = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
export const AvatarSourceSchema = z
  .string()
  .regex(new RegExp(`^avatar-(?:resource|draft):${AVATAR_ID}$`));
export const AvatarResourceReferenceSchema = z
  .string()
  .regex(new RegExp(`^avatar-resource:${AVATAR_ID}$`));

/**
 * What the user picked: a character from the on-device library and the circle colour. A character that is missing from the library (deleted, or not restored) leaves the
 * avatar on its cover.
 */
export const AvatarRecipeSchema = z.strictObject({
  character: AvatarCharacterIdSchema,
  background: z.string().regex(/^#[0-9a-f]{6}$/),
});
export type AvatarRecipe = z.infer<typeof AvatarRecipeSchema>;

/** Portable resource content. Device paths and the owning Agent never enter this file. */
export const AvatarResourceSchema = z.strictObject({
  version: z.literal(1),
  kind: z.literal('character'),
  recipe: AvatarRecipeSchema,
});
export type AvatarResource = z.infer<typeof AvatarResourceSchema>;

export function isAvatarSource(value: string | null | undefined): value is string {
  return AvatarSourceSchema.safeParse(value).success;
}

/** The PNG cover and JSON recipe share this ID inside their owning directory. */
export function avatarResourceFiles(reference: string): [string, string] {
  const id = AvatarResourceReferenceSchema.parse(reference).slice('avatar-resource:'.length);
  return [`${id}.json`, `${id}.png`];
}
