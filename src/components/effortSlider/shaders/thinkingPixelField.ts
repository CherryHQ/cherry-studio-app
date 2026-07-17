import { Skia } from '@shopify/react-native-skia';

/**
 * SkSL port of the claude-model-selector "Ultracode" pixel field.
 *
 * The JS original loops over ~6px cells on a 2D canvas; here every pixel
 * derives its owning cell (`floor(pos / CELL)`) and runs the same per-cell
 * hash math, so all pixels of one cell agree and the cell-grid look is
 * preserved while the whole thing runs per-pixel on the GPU.
 *
 * Loop-safety: `uTime` is pre-wrapped to [0, WRAP) on the JS side. Every
 * period in here divides WRAP exactly — the 4 s flow cycle, the quantized
 * flicker buckets, whole sine cycles for tone drift, and cluster hashes
 * taken mod (WRAP / FLOW_PERIOD) * 9 — so the wrap lands on a seamless
 * frame. Deviations from the original for this: flicker periods come from
 * 8 buckets instead of a continuous 500–2000 ms range, the tone-drift flow
 * coefficient is 0.2 instead of 0.18, and its sine runs 26 whole cycles per
 * wrap (≈1.361 rad/s vs the original 1.35 rad/s). All visually equivalent.
 *
 * Precision: hashes and phases stay in `float` (highp); only the final color
 * narrows to half4 (premultiplied). If a specific Android GPU shows banding
 * or repeating patterns from its sin() implementation, swap `cellHash` for
 * the sin-free variant kept below.
 */
export const THINKING_PIXEL_FIELD_SKSL = `
uniform float2 uResolution;
uniform float uTime;       // seconds, pre-wrapped to [0, WRAP)
uniform float uReveal;     // linear 0..1 ignition progress
uniform float uFieldAlpha; // whole-field opacity (fade-out on leave)
uniform float3 uLeft;
uniform float3 uHighlight;
uniform float3 uPeak;
uniform float3 uChromaLo;
uniform float3 uChromaHi;
uniform float3 uBg[4];
uniform float3 uPalette[11];

const float CELL = 6.0;
const float GAP = 1.1;
const float FLOW_PERIOD = 4.0;
const float WRAP = 120.0;
const float TAU = 6.28318530718;

float cellHash(float2 cell, float2 k, float big) {
  return fract(abs(sin(dot(cell, k))) * big);
}
// Sin-free fallback (Dave Hoskins) for GPUs with poor sin() precision:
// float cellHash(float2 cell, float2 k, float big) {
//   float3 p = fract(float3(cell.x, cell.y, cell.x) * 0.1031 + k.xyx * 0.011);
//   p += dot(p, p.yzx + 33.33);
//   return fract((p.x + p.y) * p.z);
// }

half4 main(float2 pos) {
  float2 cell = floor(pos / CELL);
  float2 cellUv = fract(pos / CELL);

  // The JS original evaluates everything at the cell center's normalized x.
  float nx = (cell.x + 0.5) * CELL / uResolution.x;
  float nxPixel = pos.x / uResolution.x;

  float reveal = smoothstep(0.0, 1.0, uReveal);
  float frontier = 1.0 - reveal;

  // Background gradient sweeps in with the same frontier window as the cells.
  float bgA = smoothstep(frontier - 0.1, frontier + 0.07, nxPixel);
  float3 bg = uBg[0];
  bg = mix(bg, uBg[1], smoothstep(0.0, 0.33, nxPixel));
  bg = mix(bg, uBg[2], smoothstep(0.33, 0.66, nxPixel));
  bg = mix(bg, uBg[3], smoothstep(0.66, 1.0, nxPixel));

  // Gap between cells, anti-aliased over ~0.6dp.
  float inset = (GAP * 0.5) / CELL;
  float aa = 0.1;
  float2 edge = smoothstep(float2(inset - aa), float2(inset + aa), cellUv)
    * smoothstep(float2(inset - aa), float2(inset + aa), float2(1.0) - cellUv);
  float cellMask = edge.x * edge.y;

  float revealAlpha = smoothstep(frontier - 0.1, frontier + 0.07, nx);
  float tintAmount = smoothstep(0.1, 0.88, nx);
  float fieldIntensity = smoothstep(0.04, 0.38, nx);
  float depthBias = smoothstep(0.35, 0.95, nx);

  float baseHash = cellHash(cell, float2(12.9898, 78.233), 43758.5453);
  float tempoHash = cellHash(cell, float2(7.13, 19.41), 19341.731);
  float phaseHash = cellHash(cell, float2(31.17, 11.93), 28437.123);
  float chromaHash = cellHash(cell, float2(9.47, 67.13), 15823.917);

  // Quantized flicker period buckets, all dividing WRAP.
  float period = 0.5;
  period = mix(period, 0.6, step(0.125, tempoHash));
  period = mix(period, 0.75, step(0.25, tempoHash));
  period = mix(period, 0.8, step(0.375, tempoHash));
  period = mix(period, 1.0, step(0.5, tempoHash));
  period = mix(period, 1.2, step(0.625, tempoHash));
  period = mix(period, 1.5, step(0.75, tempoHash));
  period = mix(period, 2.0, step(0.875, tempoHash));

  float localTime = uTime + phaseHash * period;
  float cycleId = mod(floor(localTime / period), WRAP / period);
  float cycleProgress = fract(localTime / period);

  float cycleHash = fract(abs(sin(cell.x * 17.17 + cell.y * 41.73 + cycleId * 13.11)) * 24634.6345);
  float widthHash = fract(abs(sin(cell.x * 5.37 + cell.y * 29.11 + cycleId * 7.43)) * 17391.443);

  // Irregular per-cell pulse: gaussian envelope, most cycles active.
  float pulseCenter = 0.2 + cycleHash * 0.55;
  float pulseWidth = 0.09 + widthHash * 0.08;
  float pulseDistance = (cycleProgress - pulseCenter) / pulseWidth;
  float pulseEnvelope = exp(-pulseDistance * pulseDistance * 1.45);
  float activeCycle = cycleHash > 0.12 ? 1.0 : 0.26;
  float irregularFlicker = pulseEnvelope * activeCycle;

  // Directional flow: eased 4 s cycle of drifting cluster gates + cos^5 wave.
  float rawFlow = uTime / FLOW_PERIOD;
  float easedFlow = floor(rawFlow) + smoothstep(0.0, 1.0, fract(rawFlow));
  float flowCoordinate = (nx + easedFlow) * 9.0;
  float flowIndex = mod(floor(flowCoordinate), 270.0);
  float flowProgress = smoothstep(0.0, 1.0, fract(flowCoordinate));
  float flowHashA = fract(abs(sin(flowIndex * 18.31 + cell.y * 37.17)) * 19283.173);
  float flowHashB = fract(abs(sin(mod(flowIndex + 1.0, 270.0) * 18.31 + cell.y * 37.17)) * 19283.173);
  float clusterGate = smoothstep(0.46, 0.84, mix(flowHashA, flowHashB, flowProgress));
  float wavePhase = (nx + easedFlow + cell.y * 0.06 + baseHash * 0.02) * TAU;
  float directionalWave = pow(0.5 + 0.5 * cos(wavePhase), 5.0);
  float directionalFlow = max(clusterGate, directionalWave * 0.62);
  float flowingFlicker = max(
    irregularFlicker * (0.48 + directionalFlow * 0.58),
    directionalFlow * (0.38 + baseHash * 0.28));

  // Cells light up around the frontier while the reveal sweeps.
  float revealGlow = exp(-((nx - frontier) * (nx - frontier)) / 0.012)
    * (1.0 - smoothstep(0.7, 1.0, reveal));
  float lightAmount = max(flowingFlicker, revealGlow * (0.4 + baseHash * 0.4));

  bool peakHighlight = lightAmount > 0.4 && irregularFlicker > 0.16
    && cycleHash > 0.26 && clusterGate > 0.04;
  bool hottestHighlight = lightAmount > 0.68 && irregularFlicker > 0.3
    && cycleHash > 0.48 && clusterGate > 0.12;
  float highlightAmount = peakHighlight
    ? 0.97
    : clamp(lightAmount * (0.44 + cycleHash * 0.3), 0.0, 0.64);

  float toneDrift = baseHash * 0.28 + depthBias * 0.28 + cycleProgress * 0.38
    + easedFlow * 0.2 + cycleHash * 0.2
    + sin(uTime * 1.36135681656 + phaseHash * TAU) * 0.14;
  float tp = fract(toneDrift) * 11.0;
  float3 tone = uPalette[0];
  tone = mix(tone, uPalette[1], clamp(tp, 0.0, 1.0));
  tone = mix(tone, uPalette[2], clamp(tp - 1.0, 0.0, 1.0));
  tone = mix(tone, uPalette[3], clamp(tp - 2.0, 0.0, 1.0));
  tone = mix(tone, uPalette[4], clamp(tp - 3.0, 0.0, 1.0));
  tone = mix(tone, uPalette[5], clamp(tp - 4.0, 0.0, 1.0));
  tone = mix(tone, uPalette[6], clamp(tp - 5.0, 0.0, 1.0));
  tone = mix(tone, uPalette[7], clamp(tp - 6.0, 0.0, 1.0));
  tone = mix(tone, uPalette[8], clamp(tp - 7.0, 0.0, 1.0));
  tone = mix(tone, uPalette[9], clamp(tp - 8.0, 0.0, 1.0));
  tone = mix(tone, uPalette[10], clamp(tp - 9.0, 0.0, 1.0));
  tone = mix(tone, uPalette[0], clamp(tp - 10.0, 0.0, 1.0));

  // Per-cell chroma variation; nudge terms are on the original's 0–255 scale.
  float nudge = ((chromaHash - 0.5) * 10.0 + depthBias * 12.0) / 255.0;
  float3 varied = clamp(
    float3(
      tone.r + nudge * 0.35 - depthBias * (8.0 / 255.0),
      tone.g - depthBias * (16.0 / 255.0) + (baseHash - 0.5) * (8.0 / 255.0),
      tone.b + depthBias * (6.0 / 255.0) + (cycleHash - 0.5) * (6.0 / 255.0)),
    uChromaLo, uChromaHi);
  float3 baseColor = mix(uLeft, varied, tintAmount);
  float3 color = hottestHighlight
    ? mix(baseColor, uPeak, 0.95)
    : mix(baseColor, uHighlight, highlightAmount);

  float baseOpacity = 0.7 + baseHash * 0.2;
  float pxA = revealAlpha * fieldIntensity;
  if (!peakHighlight && !hottestHighlight) {
    pxA *= clamp(baseOpacity + flowingFlicker * 0.12, 0.0, 1.0);
  }
  pxA *= cellMask;

  float3 outRgb = mix(bg, color, pxA);
  float outA = bgA * uFieldAlpha;
  return half4(half3(outRgb * outA), half(outA));
}
`;

const effect = Skia.RuntimeEffect.Make(THINKING_PIXEL_FIELD_SKSL);

if (!effect) {
  throw new Error('effortSlider: failed to compile thinking pixel field shader');
}

export const thinkingPixelFieldEffect = effect;
