export interface ProviderAvatarDisplayConfig {
  borderRadius?: number;
  scale: number;
}

export const DEFAULT_PROVIDER_ICON_SCALE = 0.8125;

const PROVIDER_LIST_CONTAINED_ICON: Readonly<ProviderAvatarDisplayConfig> = {
  borderRadius: 5,
  scale: 5 / 7,
};
const PROVIDER_LIST_DEFAULT_ICON: Readonly<ProviderAvatarDisplayConfig> = {
  // Native provider assets are trimmed during generation, unlike desktop SVGs.
  scale: DEFAULT_PROVIDER_ICON_SCALE,
};
const PROVIDER_LIST_CONTAINED_ICON_IDS = new Set([
  'aihubmix',
  'anthropic',
  'aws-bedrock',
  'cherryin',
  'groq',
  'lmstudio',
  'yi',
]);

export function getProviderListIconDisplayConfig(
  iconId: string | undefined,
): ProviderAvatarDisplayConfig | undefined {
  if (!iconId) {
    return undefined;
  }

  return PROVIDER_LIST_CONTAINED_ICON_IDS.has(iconId.toLowerCase())
    ? PROVIDER_LIST_CONTAINED_ICON
    : PROVIDER_LIST_DEFAULT_ICON;
}

export function getProviderAvatarFallback(providerName: string) {
  const initial = getFirstCharacter(providerName) || 'P';
  const backgroundColor = generateColorFromCharacter(providerName || initial);

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
