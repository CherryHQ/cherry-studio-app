import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';

const IMAGE_GENERATION_LOADER_SKSL = `
uniform float2 uResolution;
uniform float uTime;
uniform float uStatic;
uniform float4 uBaseColor;
uniform float4 uGlowColor;

const float GRID_SIZE = 19.0;
const float MORPH_PERIOD = 4.2;
const float BREATHE_PERIOD = 1.9;
const float TAU = 6.28318530718;

float easeOutBack(float t) {
  const float c1 = 1.70158;
  const float c3 = c1 + 1.0;
  float x = t - 1.0;
  return 1.0 + c3 * x * x * x + c1 * x * x;
}

float4 interpolateBlob(
  float stage,
  float4 keyframe0,
  float4 keyframe1,
  float4 keyframe2,
  float4 keyframe3
) {
  float segment = floor(stage);
  float amount = easeOutBack(fract(stage));

  if (segment < 1.0) {
    return mix(keyframe0, keyframe1, amount);
  }
  if (segment < 2.0) {
    return mix(keyframe1, keyframe2, amount);
  }
  if (segment < 3.0) {
    return mix(keyframe2, keyframe3, amount);
  }
  return mix(keyframe3, keyframe0, amount);
}

float ellipseMask(float2 uv, float4 blob) {
  float distanceFromCenter = length((uv - blob.xy) / blob.zw);
  return 1.0 - smoothstep(0.0, 1.0, distanceFromCenter);
}

half4 main(float2 position) {
  float cellSize = min(uResolution.x, uResolution.y) / GRID_SIZE;
  float2 cellPosition = (fract(position / cellSize) - 0.5) * cellSize;
  float dotDistance = length(cellPosition);
  float scale = min(uResolution.x, uResolution.y) / 208.0;
  float antialias = max(0.35, 0.45 * scale);
  float baseDot = 1.0 - smoothstep(max(0.0, 0.7 * scale - antialias), 0.7 * scale + antialias, dotDistance);
  float glowDot = 1.0 - smoothstep(max(0.0, 1.1 * scale - antialias), 1.1 * scale + antialias, dotDistance);

  float morphStage = mod(uTime, MORPH_PERIOD) / MORPH_PERIOD * 4.0;
  morphStage = mix(morphStage, 0.0, uStatic);

  // xy is the normalized center and zw is the normalized ellipse radius.
  float4 primaryBlob = interpolateBlob(
    morphStage,
    float4(0.3368, 0.3380, 0.2600, 0.2300),
    float4(0.6836, 0.3572, 0.2300, 0.2900),
    float4(0.6280, 0.6904, 0.3000, 0.2200),
    float4(0.3328, 0.6472, 0.2400, 0.2700)
  );
  float4 secondaryBlob = interpolateBlob(
    morphStage,
    float4(0.3800, 0.3920, 0.2000, 0.2000),
    float4(0.5896, 0.3760, 0.2200, 0.1900),
    float4(0.5744, 0.5972, 0.1900, 0.2300),
    float4(0.4136, 0.5960, 0.2300, 0.2000)
  );

  float2 uv = position / uResolution;
  float primaryMask = ellipseMask(uv, primaryBlob);
  float secondaryMask = ellipseMask(uv, secondaryBlob);
  float glowMask = 1.0 - (1.0 - primaryMask) * (1.0 - secondaryMask);

  float breathePhase = mod(uTime, BREATHE_PERIOD) / BREATHE_PERIOD;
  float breathe = 0.775 - 0.225 * cos(TAU * breathePhase);
  breathe = mix(breathe, 0.7, uStatic);

  float baseAlpha = baseDot * 0.22 * uBaseColor.a;
  float glowAlpha = glowDot * glowMask * breathe * uGlowColor.a;
  float outputAlpha = glowAlpha + baseAlpha * (1.0 - glowAlpha);
  float3 premultipliedColor =
    uGlowColor.rgb * glowAlpha + uBaseColor.rgb * baseAlpha * (1.0 - glowAlpha);

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
