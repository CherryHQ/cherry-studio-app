import type { FontSizeStep } from '@cherrystudio/universal/data/preference';

const TYPOGRAPHY_SIZE_NAMES = [
  'xs',
  'sm',
  'base',
  'lg',
  'xl',
  '2xl',
  '3xl',
  '4xl',
  '5xl',
  '6xl',
  '7xl',
  '8xl',
  '9xl',
] as const;

type TypographySizeName = (typeof TYPOGRAPHY_SIZE_NAMES)[number];
type TypographySize = { fontSize: number; lineHeight: number };
type TypographyScale = Record<TypographySizeName, TypographySize>;

const emojiTypographySizeNames = ['xl', '2xl', '3xl', '6xl'] as const;

/**
 * Vercel Brand Guidelines 的排版角色。前九档逐字采用 VBG 的 size/leading 配对；
 * VBG 没有大于 48px 的角色，第十档起沿用原有的 1:1 行高，不编造。
 *
 * 这个数组同时承担无障碍字号档位：`resolveTypographyScale` 按索引平移
 * （FontSizeStep 0/1/2），所以顺序必须保持单调递增，「+1 档」即「下一级」。
 */
const sizeSequence: readonly TypographySize[] = [
  { fontSize: 13, lineHeight: 18 }, // vbg label / metadata + leading-caption
  { fontSize: 14, lineHeight: 20 }, // vbg compact
  { fontSize: 16, lineHeight: 24 }, // vbg body
  { fontSize: 18, lineHeight: 28 }, // vbg lede
  { fontSize: 20, lineHeight: 26 }, // vbg subsection
  { fontSize: 24, lineHeight: 32 }, // vbg section
  { fontSize: 32, lineHeight: 40 }, // vbg title
  { fontSize: 40, lineHeight: 48 }, // vbg page-title
  { fontSize: 48, lineHeight: 56 }, // vbg display
  { fontSize: 60, lineHeight: 60 },
  { fontSize: 72, lineHeight: 72 },
  { fontSize: 96, lineHeight: 96 },
  { fontSize: 128, lineHeight: 128 },
];

export function normalizeFontSizeStep(value: unknown): FontSizeStep {
  return value === 1 || value === 2 ? value : 0;
}

export function resolveTypographyScale(value: unknown): TypographyScale {
  const step = normalizeFontSizeStep(value);
  const lastIndex = sizeSequence.length - 1;

  return Object.fromEntries(
    TYPOGRAPHY_SIZE_NAMES.map((name, index) => [
      name,
      sizeSequence[Math.min(index + step, lastIndex)],
    ]),
  ) as TypographyScale;
}

function resolveEmojiLineHeight(fontSize: number): number {
  return Math.ceil(fontSize / 3) * 4;
}

export function createTypographyCSSVariables(value: unknown): Record<string, number> {
  const scale = resolveTypographyScale(value);

  return Object.fromEntries([
    ...TYPOGRAPHY_SIZE_NAMES.flatMap((name) => [
      [`--ui-text-${name}`, scale[name].fontSize],
      [`--ui-text-${name}--line-height`, scale[name].lineHeight],
    ]),
    ...emojiTypographySizeNames.map((name) => [
      `--ui-emoji-${name}--line-height`,
      resolveEmojiLineHeight(scale[name].fontSize),
    ]),
  ]);
}
