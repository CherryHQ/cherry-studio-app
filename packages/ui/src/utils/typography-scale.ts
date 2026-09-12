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

export type TypographySizeStep = 0 | 1 | 2;
type TypographySizeName = (typeof TYPOGRAPHY_SIZE_NAMES)[number];
type TypographySize = { fontSize: number; lineHeight: number };
export type TypographyScale = Record<TypographySizeName, TypographySize>;

const emojiTypographySizeNames = ['xl', '2xl', '3xl', '6xl'] as const;

const sizeSequence: readonly TypographySize[] = [
  { fontSize: 13, lineHeight: 18 },
  { fontSize: 14, lineHeight: 20 },
  { fontSize: 16, lineHeight: 24 },
  { fontSize: 18, lineHeight: 28 },
  { fontSize: 20, lineHeight: 26 },
  { fontSize: 24, lineHeight: 32 },
  { fontSize: 32, lineHeight: 40 },
  { fontSize: 40, lineHeight: 48 },
  { fontSize: 48, lineHeight: 56 },
  { fontSize: 60, lineHeight: 60 },
  { fontSize: 72, lineHeight: 72 },
  { fontSize: 96, lineHeight: 96 },
  { fontSize: 128, lineHeight: 128 },
];

export function normalizeFontSizeStep(value: unknown): TypographySizeStep {
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
