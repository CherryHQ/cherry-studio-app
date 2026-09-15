import { type IconSource, resolveProviderIcon } from '@cherrystudio/ui/icons';

export interface BrandAvatarDisplayConfig {
  scale: number;
}

export const DEFAULT_BRAND_ICON_SCALE = 1;
// Provider WebPs are cropped to their visible bounds during generation. This
// shared inset restores breathing room after that asset-level normalization.
const PROVIDER_BRAND_ICON_SCALE = 0.8125;
// Keep a square mark inside the circle, including its corner details.
const CIRCULAR_PROVIDER_BRAND_ICON_SCALE = 0.7;

// Key by the resolved asset pair: aliases and model-to-provider fallbacks must
// use the layout of the image actually displayed, not the configured provider.
const FULL_FRAME_PROVIDER_ICONS = new Set(
  [
    '3min-top',
    'abacus',
    'aihubmix',
    'aionlabs',
    'anthropic',
    'aws-bedrock',
    'cherryin',
    'coze',
    'felo',
    'groq',
    'higress',
    'lmstudio',
    'mcpso',
    'minimax-agent',
    'netease-youdao',
    'paddleocr',
    'radeon-cloud',
    'tesseract-js',
    'zero-one',
  ].flatMap((id) => {
    const icon = resolveProviderIcon(id);
    return icon ? [icon] : [];
  }),
);

// These provider fallbacks use untrimmed general/model canvases. Compensate
// their existing 72px canvas at display time without changing the image files.
const PROVIDER_CANVAS_SCALES = new Map<IconSource, number>(
  (
    [
      ['opencode', 72 / 46],
      ['mimo', 72 / 48],
    ] as const
  ).flatMap(([id, scale]) => {
    const icon = resolveProviderIcon(id);
    return icon ? [[icon, scale] as const] : [];
  }),
);

export function getBrandAvatarIconDisplayConfig(
  icon: IconSource,
  shape: 'circle' | 'rounded' = 'rounded',
): BrandAvatarDisplayConfig {
  if (FULL_FRAME_PROVIDER_ICONS.has(icon)) {
    return { scale: 1 };
  }

  const inset = shape === 'circle' ? CIRCULAR_PROVIDER_BRAND_ICON_SCALE : PROVIDER_BRAND_ICON_SCALE;
  return { scale: inset * (PROVIDER_CANVAS_SCALES.get(icon) ?? 1) };
}

export function getBrandAvatarFallback(label: string) {
  const initial = getFirstCharacter(label) || 'P';
  const backgroundColor = generateColorFromCharacter(label || initial);

  return {
    backgroundColor,
    color: getForegroundColor(backgroundColor),
    initial,
  };
}

function generateColorFromCharacter(value: string) {
  const seed = value.charCodeAt(0);
  const multiplier = 1664525;
  const increment = 1013904223;
  const modulus = 2 ** 32;

  let red = (multiplier * seed + increment) % modulus;
  let green = (multiplier * red + increment) % modulus;
  let blue = (multiplier * green + increment) % modulus;

  red = Math.floor((red / modulus) * 256);
  green = Math.floor((green / modulus) * 256);
  blue = Math.floor((blue / modulus) * 256);

  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function getFirstCharacter(value: string) {
  for (const character of value) {
    return character;
  }

  return '';
}

function getForegroundColor(backgroundColor: string) {
  const red = Number.parseInt(backgroundColor.slice(1, 3), 16);
  const green = Number.parseInt(backgroundColor.slice(3, 5), 16);
  const blue = Number.parseInt(backgroundColor.slice(5, 7), 16);
  const luminance =
    0.2126 * normalizeColorChannel(red) +
    0.7152 * normalizeColorChannel(green) +
    0.0722 * normalizeColorChannel(blue);

  return luminance > 0.179 ? '#000000' : '#FFFFFF';
}

function normalizeColorChannel(channel: number) {
  const normalized = channel / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}
