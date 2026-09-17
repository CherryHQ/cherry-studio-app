import * as z from 'zod';

// These ids are persisted. Keep existing ids stable when adding artwork variants.
export const SLIME_AVATAR_SHAPES = ['round', 'flat', 'tall', 'lean', 'soft-square'] as const;
export const SLIME_AVATAR_COLORS = [
  'rose',
  'apricot',
  'mint',
  'blue',
  'lilac',
  'peach',
  'teal',
  'slate',
] as const;
export const SLIME_AVATAR_EYES = [
  'upright',
  'slant',
  'slit',
  'arch',
  'rest',
  'hollow',
  'wedge',
  'wink',
] as const;

export type SlimeAvatarParts = {
  color: (typeof SLIME_AVATAR_COLORS)[number];
  eyes: (typeof SLIME_AVATAR_EYES)[number];
  shape: (typeof SLIME_AVATAR_SHAPES)[number];
};

export const SlimeAvatarSchema = z
  .templateLiteral([
    'agent-avatar-slime:v1:',
    z.enum(SLIME_AVATAR_SHAPES),
    ':',
    z.enum(SLIME_AVATAR_COLORS),
    ':',
    z.enum(SLIME_AVATAR_EYES),
  ])
  .refine((value) => value === value.trim());
export type SlimeAvatarValue = z.infer<typeof SlimeAvatarSchema>;

/** Generate once at creation, then persist the value instead of rerolling on reads. */
export function createRandomSlimeAvatar(): SlimeAvatarValue {
  return `agent-avatar-slime:v1:${pickRandom(SLIME_AVATAR_SHAPES)}:${pickRandom(SLIME_AVATAR_COLORS)}:${pickRandom(SLIME_AVATAR_EYES)}`;
}

/** Unknown versions and legacy avatars retain the caller's existing fallback. */
export function parseSlimeAvatar(avatar: null | string | undefined): SlimeAvatarParts | null {
  const result = SlimeAvatarSchema.safeParse(avatar);
  if (!result.success) return null;

  const [, , shape, color, eyes] = result.data.split(':') as [
    string,
    string,
    SlimeAvatarParts['shape'],
    SlimeAvatarParts['color'],
    SlimeAvatarParts['eyes'],
  ];
  return { color, eyes, shape };
}

function pickRandom<T>(values: readonly [T, ...T[]]): T {
  return values[Math.floor(Math.random() * values.length)];
}
