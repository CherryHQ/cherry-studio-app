import * as z from 'zod';

/** One square, aligned image per expression; every layer of a character shares this canvas. */
export const CHARACTER_EXPRESSIONS = [
  'idle',
  'blink',
  'thinking',
  'waiting',
  'done',
  'error',
] as const;
export type CharacterExpression = (typeof CHARACTER_EXPRESSIONS)[number];

const ID = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
export const AvatarCharacterIdSchema = z.string().regex(new RegExp(`^${ID}$`));

const MAX_SIZE = 2048;
const PointSchema = z.strictObject({
  x: z.number().min(0).max(MAX_SIZE),
  y: z.number().min(0).max(MAX_SIZE),
});

/**
 * Everything the motion engine needs besides pixels, in canvas pixels. `frame` and `neck` are
 * derived from the idle silhouette when a pack omits them; `tuft` and `sways` are optional
 * refinements (a separately springing hair tuft, hair masses that swing on their own).
 */
export const CharacterRigSchema = z.strictObject({
  frame: z.strictObject({
    center: PointSchema,
    side: z
      .number()
      .positive()
      .max(MAX_SIZE * 2),
  }),
  neck: PointSchema,
  tuft: z.strictObject({ pivot: PointSchema }).optional(),
  sways: z.array(PointSchema).max(4).default([]),
});

export const CharacterManifestSchema = z.strictObject({
  version: z.literal(1),
  name: z.string().trim().min(1).max(40),
  size: z.number().int().min(128).max(MAX_SIZE),
  rig: CharacterRigSchema,
});
export type CharacterManifest = z.infer<typeof CharacterManifestSchema>;

/** Layer names shared by stored libraries and imported packs. */
export function characterLayers(manifest: { rig: { tuft?: object } }): string[] {
  return [...CHARACTER_EXPRESSIONS, ...(manifest.rig.tuft ? ['tuft'] : [])];
}

/**
 * An importable pack: `character.json` plus one PNG or WebP per layer. Its rig may leave out
 * `frame` and `neck`; the library derives them from the idle image.
 */
export const CharacterPackManifestSchema = CharacterManifestSchema.extend({
  rig: CharacterRigSchema.partial({ frame: true, neck: true }),
});
export type CharacterPackManifest = z.infer<typeof CharacterPackManifestSchema>;
