/**
 * Color sets for the thinking pixel field, pre-normalized to 0..1 and
 * flattened into the layouts the shader uniforms expect.
 *
 * The web original (claude-model-selector) is purple; this port hue-rotates
 * every chromatic value onto the app's brand green (--primary,
 * oklch hue 146) in OKLCH, preserving each color's lightness and chroma so
 * the field keeps the original's tonal structure. The dark palette keeps the
 * same hue relationships but flips the luminance structure: bases are pushed
 * down toward the surface, highlights stay bright, so the field reads as
 * self-lit LEDs on a dark track instead of a washed-out sticker.
 *
 * These stay literal on purpose, as the one place in the app that does not name
 * a token. They are an 11-stop tonal ramp plus its mix targets, share-weighted
 * so deep tones dominate; the palette ships five green steps, which cannot
 * reconstruct that and would flatten the field into bands. What did name a
 * token was the accent — a frozen copy of `--primary`, which the theme-colour
 * setting rewrites at runtime, so it went stale the moment anyone changed it.
 * That one now reads the variable at its point of use.
 */

export type ThinkingPaletteUniforms = {
  /** 11 share-weighted tone stops, flattened to 33 floats (float3[11]). */
  palette: number[];
  /** Highlight mix target (float3). */
  highlight: number[];
  /** Hottest peak mix target (float3). */
  peak: number[];
  /** Neutral color the far-left cells blend from (float3). */
  left: number[];
  /** Lower clamp for the per-cell chroma variation (float3). */
  chromaLo: number[];
  /** Upper clamp for the per-cell chroma variation (float3). */
  chromaHi: number[];
  /** 4 background-gradient anchors, flattened to 12 floats (float3[4]). */
  bg: number[];
};

/** Static gradient stops for the reduced-motion fallback (hex, left→right). */
export type ThinkingFallbackGradient = readonly [string, string, string];

const rgb = (r: number, g: number, b: number) => [r / 255, g / 255, b / 255];

function tones(...stops: number[][]): number[] {
  return stops.flat();
}

const lightDeepGreen = rgb(84, 158, 102);
const lightDeepMid = rgb(108, 161, 111);
const lightMidGreen = rgb(120, 173, 124);
const lightSoftMid = rgb(142, 176, 134);
const lightSoftSage = rgb(156, 184, 154);
const lightPaleCool = rgb(170, 193, 174);

export const lightThinkingPalette: ThinkingPaletteUniforms = {
  // Share weighting matches the original: deep tones dominate.
  palette: tones(
    lightDeepGreen,
    lightDeepGreen,
    lightDeepMid,
    lightDeepMid,
    lightMidGreen,
    lightMidGreen,
    lightMidGreen,
    lightSoftMid,
    lightSoftMid,
    lightSoftSage,
    lightPaleCool,
  ),
  highlight: rgb(194, 217, 198),
  peak: rgb(217, 233, 219),
  left: rgb(203, 210, 204),
  chromaLo: rgb(66, 143, 80),
  chromaHi: rgb(144, 195, 160),
  bg: tones(rgb(238, 235, 233), rgb(216, 225, 220), rgb(181, 207, 189), rgb(172, 203, 181)),
};

const darkDeepGreen = rgb(29, 103, 19);
const darkDeepMid = rgb(52, 105, 31);
const darkMidGreen = rgb(58, 119, 43);
const darkSoftMid = rgb(73, 121, 52);
const darkSoftSage = rgb(81, 130, 72);
const darkPaleCool = rgb(94, 140, 91);

export const darkThinkingPalette: ThinkingPaletteUniforms = {
  palette: tones(
    darkDeepGreen,
    darkDeepGreen,
    darkDeepMid,
    darkDeepMid,
    darkMidGreen,
    darkMidGreen,
    darkMidGreen,
    darkSoftMid,
    darkSoftMid,
    darkSoftSage,
    darkPaleCool,
  ),
  highlight: rgb(170, 204, 171),
  peak: rgb(205, 229, 204),
  left: rgb(65, 73, 62),
  chromaLo: rgb(19, 65, 12),
  chromaHi: rgb(69, 143, 83),
  bg: tones(rgb(42, 40, 48), rgb(41, 53, 40), rgb(41, 64, 39), rgb(45, 71, 42)),
};

/**
 * Stop-dot color (the original's `.tick`: #b6b2af at 0.82 opacity).
 *
 * Literal like everything else above it, and for the same reason: these values
 * were eyedropped from the original and then hue-rotated as a set, so they hold
 * their relationships to each other rather than to any semantic role. There is
 * no token that means "the neutral this particular field reads well against" —
 * the nearest neutrals (`--foreground-disabled` resolves to 125 in both themes)
 * match the dark tick and miss the light one by 57.
 */
export const effortTickColor = {
  light: 'rgba(182, 178, 175, 0.82)',
  dark: 'rgba(126, 122, 134, 0.9)',
} as const;

/** Reduced-motion static gradients (the original's `.ultra-fallback`, hue-rotated). */
export const lightThinkingFallbackGradient: ThinkingFallbackGradient = [
  '#eeebe9',
  '#a5c7b1',
  '#85b495',
];

export const darkThinkingFallbackGradient: ThinkingFallbackGradient = [
  '#2a2830',
  '#2f502a',
  '#376234',
];
