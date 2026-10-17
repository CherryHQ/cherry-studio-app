import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';

const IMAGE_GENERATION_LOADER_SKSL = `
uniform float2 uResolution;
uniform float uTime;
uniform float uStatic;
uniform float4 uSurfaceColor;

const float CYCLE_SECONDS = 2.4;

float hash(float2 position) {
  return fract(sin(dot(position, float2(12.9898, 78.233))) * 43758.5453);
}

float3 spectrum(float hue) {
  return 0.5 + 0.5 * cos(6.28318 * (hue + float3(0.0, 0.33, 0.67)));
}

half4 main(float2 position) {
  float shortSide = min(uResolution.x, uResolution.y);
  float2 p = (position - uResolution * 0.5) / shortSide;
  float2 direction = normalize(float2(1.0, 0.55));
  float along = dot(p, float2(-direction.y, direction.x));
  float extent = 0.5 * (direction.x * uResolution.x + direction.y * uResolution.y) / shortSide;
  // Dark surfaces take a dimmer pearl and stronger foil color; light ones the reverse.
  float dark = 1.0 - smoothstep(0.25, 0.6, dot(uSurfaceColor.rgb, float3(0.2126, 0.7152, 0.0722)));

  // Each cycle the light crosses the card from one off-card corner to the other.
  // It fades at both ends of the cycle, so the restart is invisible.
  float cycle = fract(uTime / CYCLE_SECONDS);
  float eased = mix(cycle, cycle * cycle * (3.0 - 2.0 * cycle), 0.5);
  float light = mix(-extent - 0.35, extent + 0.35, eased);
  float presence = smoothstep(0.0, 0.12, cycle) * smoothstep(1.0, 0.88, cycle);
  float x = dot(p, direction) - light + 0.06 * along * along;
  float spotOffset = along + (eased - 0.5) * 0.4;
  float spot = exp(-spotOffset * spotOffset * 2.5);
  float wash = exp(-x * x * 5.0) * presence;
  float band = exp(-x * x * 30.0) * presence;
  float core = exp(-x * x * 260.0) * presence;

  // Pearl base: a broad pastel field that drifts slowly and never jumps.
  float pearlHue = dot(p, float2(0.45, 0.3)) + 0.08 * sin(6.28318 * cycle);
  float3 pearl = mix(float3(1.0), spectrum(pearlHue), 0.35);
  // Foil: fine spectral lines that only the passing light reveals.
  float foilHue = dot(p, float2(0.9, -0.42)) * 14.0 + light * 2.0;
  float3 foil = mix(float3(1.0), spectrum(foilHue), mix(0.45, 0.7, dark));
  float sparkle = smoothstep(0.985, 1.0, hash(floor(position))) * band;

  float pearlAlpha = mix(0.2, 0.1, dark) * (0.4 + 0.6 * wash);
  float foilAlpha = band * mix(0.5, 0.32, dark) * (0.5 + 0.5 * spot);
  float glareAlpha = clamp(
    core * mix(0.8, 0.65, dark) * (0.3 + 0.7 * spot) + wash * mix(0.1, 0.06, dark) + sparkle * 0.7,
    0.0,
    1.0
  );

  float3 color = pearl * pearlAlpha;
  float alpha = pearlAlpha;
  color = foil * foilAlpha + color * (1.0 - foilAlpha);
  alpha = foilAlpha + alpha * (1.0 - foilAlpha);
  color = glareAlpha + color * (1.0 - glareAlpha);
  alpha = glareAlpha + alpha * (1.0 - glareAlpha);
  float live = 1.0 - uStatic;
  return half4(half3(color * live), half(alpha * live));
}
`;

let cachedEffect: SkRuntimeEffect | undefined;

export function getImageGenerationLoaderEffect(): SkRuntimeEffect {
  if (cachedEffect) return cachedEffect;

  const effect = Skia.RuntimeEffect.Make(IMAGE_GENERATION_LOADER_SKSL);
  if (!effect) {
    throw new Error('ImageGenerationLoader: failed to compile foil shader');
  }

  cachedEffect = effect;
  return effect;
}
