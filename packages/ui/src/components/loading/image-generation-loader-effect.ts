import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';

const IMAGE_GENERATION_LOADER_SKSL = `
uniform float2 uResolution;
uniform float uTime;
uniform float uStatic;
uniform float4 uBaseColor;
uniform float4 uGlowColor;
uniform float4 uGlareColor;

const float GRID_SIZE = 19.0;
const float GLARE_PERIOD = 4.8;

half4 main(float2 position) {
  float cellSize = min(uResolution.x, uResolution.y) / GRID_SIZE;
  float2 cellPosition = (fract(position / cellSize) - 0.5) * cellSize;
  float dotDistance = length(cellPosition);
  float scale = min(uResolution.x, uResolution.y) / 208.0;
  float antialias = max(0.35, 0.45 * scale);
  float baseDot = 1.0 - smoothstep(max(0.0, 0.7 * scale - antialias), 0.7 * scale + antialias, dotDistance);
  float glowDot = 1.0 - smoothstep(max(0.0, 1.1 * scale - antialias), 1.1 * scale + antialias, dotDistance);

  // Project in points so the reflection keeps its angle on portrait and landscape previews.
  float diagonal = position.x + position.y * 0.55;
  float extent = uResolution.x + uResolution.y * 0.55;
  float bandWidth = min(uResolution.x, uResolution.y) * 0.6;
  float phase = mod(uTime, GLARE_PERIOD) / GLARE_PERIOD;
  // The last fifth of each cycle rests off-canvas; wrapping never snaps a visible band.
  float sweep = min(phase / 0.8, 1.0);
  float center = mix(-bandWidth, extent + bandWidth, sweep);
  float glareMask = (1.0 - smoothstep(0.0, bandWidth, abs(diagonal - center))) * (1.0 - uStatic);
  float reflectionMask = glareMask * (0.65 + 0.35 * glareMask * glareMask);

  float baseAlpha = baseDot * 0.22 * uBaseColor.a;
  float glowAlpha = glowDot * glareMask * 0.4 * uGlowColor.a;
  float fieldAlpha = glowAlpha + baseAlpha * (1.0 - glowAlpha);
  float3 fieldColor =
    uGlowColor.rgb * glowAlpha + uBaseColor.rgb * baseAlpha * (1.0 - glowAlpha);
  // Composite the reflection over the dots as well as the surface, keeping premultiplied alpha.
  float glareAlpha = reflectionMask * uGlareColor.a;
  float outputAlpha = glareAlpha + fieldAlpha * (1.0 - glareAlpha);
  float3 premultipliedColor = uGlareColor.rgb * glareAlpha + fieldColor * (1.0 - glareAlpha);

  return half4(half3(premultipliedColor), half(outputAlpha));
}
`;

let cachedEffect: SkRuntimeEffect | undefined;

export function getImageGenerationLoaderEffect(): SkRuntimeEffect {
  if (cachedEffect) return cachedEffect;

  const effect = Skia.RuntimeEffect.Make(IMAGE_GENERATION_LOADER_SKSL);
  if (!effect) {
    throw new Error('ImageGenerationLoader: failed to compile dot field shader');
  }

  cachedEffect = effect;
  return effect;
}
