export function generateColorFromChar(char: string): string {
  const seed = char.charCodeAt(0);
  const a = 1664525;
  const c = 1013904223;
  const m = 2 ** 32;

  let r = (a * seed + c) % m;
  let g = (a * r + c) % m;
  let b = (a * g + c) % m;

  r = Math.floor((r / m) * 256);
  g = Math.floor((g / m) * 256);
  b = Math.floor((b / m) * 256);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function getRGB(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.substring(0, 2), 16),
    parseInt(clean.substring(2, 4), 16),
    parseInt(clean.substring(4, 6), 16),
  ];
}

function getRelativeLuminance(r: number, g: number, b: number): number {
  const rsrgb = r / 255;
  const gsrgb = g / 255;
  const bsrgb = b / 255;

  const rLinear = rsrgb <= 0.03928 ? rsrgb / 12.92 : ((rsrgb + 0.055) / 1.055) ** 2.4;
  const gLinear = gsrgb <= 0.03928 ? gsrgb / 12.92 : ((gsrgb + 0.055) / 1.055) ** 2.4;
  const bLinear = bsrgb <= 0.03928 ? bsrgb / 12.92 : ((bsrgb + 0.055) / 1.055) ** 2.4;

  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

export function getForegroundColor(backgroundColor: string): string {
  const [r, g, b] = getRGB(backgroundColor);
  const luminance = getRelativeLuminance(r, g, b);

  return luminance > 0.179 ? '#000000' : '#FFFFFF';
}

export function getProviderAvatarColor(name: string): { bg: string; fg: string } {
  const firstChar = name.trim().charAt(0) || '?';
  const bg = generateColorFromChar(firstChar);
  const fg = getForegroundColor(bg);

  return { bg, fg };
}
