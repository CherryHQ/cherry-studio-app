/** Runtime accent palettes. Neutral surfaces, links, status colors and brand artwork stay separate. */
export const THEME_PALETTES = {
  // The default is the sRGB projection of the existing green-900 and control-active tokens.
  green: { light: '#107d32', dark: '#00ca50', control: '#24b242' },
  blue: { light: '#005ff2', dark: '#47a8ff', control: '#006efe' },
  purple: { light: '#7e22ce', dark: '#c084fc', control: '#9333ea' },
  teal: { light: '#0f766e', dark: '#2dd4bf', control: '#0d9488' },
  orange: { light: '#c2410c', dark: '#fb923c', control: '#ea580c' },
  pink: { light: '#be185d', dark: '#f472b6', control: '#db2777' },
} as const;

export type ThemePaletteId = keyof typeof THEME_PALETTES;
export type ThemeAppearance = 'light' | 'dark';

export const DEFAULT_THEME_PALETTE: ThemePaletteId = 'green';
export const THEME_PALETTE_IDS = Object.keys(THEME_PALETTES) as readonly ThemePaletteId[];

/** Unknown restored values display the default without rewriting the saved preference. */
export function normalizeThemePalette(value: unknown): ThemePaletteId {
  return typeof value === 'string' && THEME_PALETTE_IDS.includes(value as ThemePaletteId)
    ? (value as ThemePaletteId)
    : DEFAULT_THEME_PALETTE;
}

export function createThemePaletteVariables(value: unknown, appearance: ThemeAppearance) {
  const palette = THEME_PALETTES[normalizeThemePalette(value)];

  // Override the source variables so ring, inline-code and HeroUI's derived accent roles
  // continue following the existing CSS dependency graph rather than separate runtime copies.
  return {
    '--primary': palette[appearance],
    '--primary-foreground': appearance === 'dark' ? '#000000' : '#ffffff',
    '--control-active': palette.control,
  };
}
