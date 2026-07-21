import { Skia } from '@shopify/react-native-skia';

import { paintingSkeleton } from '@/config/constants';

/**
 * SkSL port of the desktop paintings grid skeleton (PaintingSkeletonGrid.tsx).
 *
 * The desktop original animates one DOM node per cell with Framer Motion:
 * opacity keyframes [min, min, peak, afterglow, min] at times [0, T1, T2, T3, 1]
 * over a 1.9 s infinite loop, phase-shifted per cell so the brightness peak
 * sweeps the diagonals from the bottom-left to the top-right. Here every pixel
 * derives its owning cell and runs the same per-cell math, so all pixels of a
 * cell agree and the whole grid is one GPU pass.
 *
 * Parity notes:
 * - The hash is the desktop `cellNoise` verbatim (the classic GLSL one-liner);
 *   same salts, same row-major cell index.
 * - Framer's negative start delay on an infinite loop is congruent to a phase
 *   offset: progress = fract((t - delay) / PERIOD). `uTime` is pre-wrapped to
 *   [0, PERIOD) on the JS side and only ever consumed through that fract, so
 *   the wrap is seamless and sin() arguments stay small.
 * - Framer's easeInOut is cubic-bezier(0.42, 0, 0.58, 1), whose output
 *   polynomial is exactly smoothstep (3t²−2t³); the axes differ only by a time
 *   reparameterization of ≤2.5% of a segment (≤19 ms here), so each keyframe
 *   segment maps to one smoothstep.
 * - If a specific Android GPU shows patterning from its sin() implementation,
 *   swap the hash for a sin-free variant (see thinkingPixelField.ts).
 */
const f = (n: number) => (Number.isInteger(n) ? `${n}.0` : `${n}`);

const k = paintingSkeleton;
const [t1, t2, t3] = k.keyframeTimes;

export const PAINTING_SKELETON_GRID_SKSL = `
uniform float uTime;   // seconds, pre-wrapped to [0, PERIOD)
uniform float2 uGrid;  // (cols, rows)
uniform float2 uCell;  // (cellWidth, cellHeight) in dp
uniform float3 uColor; // foreground rgb, normalized
uniform float uStatic; // 1 = reduced-motion static snapshot

const float GAP = ${f(k.gap)};
const float RADIUS = ${f(k.cellRadius)};
const float PERIOD = ${f(k.periodSeconds)};
const float ALPHA_MIN = ${f(k.alphaMin)};
const float PEAK_MIN = ${f(k.peakMin)};
const float PEAK_MAX = ${f(k.peakMax)};
const float AFTERGLOW = ${f(k.afterglow)};
const float PHASE_JITTER = ${f(k.phaseJitter)};
const float T1 = ${f(t1)};
const float T2 = ${f(t2)};
const float T3 = ${f(t3)};
const float STATIC_ALPHA = ${f(k.reducedMotionAlpha)};
const float FG_ALPHA = ${f(k.foregroundAlpha)};

float cellNoise(float i, float salt) {
  return fract(sin(i * 12.9898 + salt * 78.233) * 43758.5453);
}

half4 main(float2 pos) {
  // Owning cell; the gap after a cell belongs to it and the SDF carves it out.
  float2 stride = uCell + GAP;
  float2 rc = clamp(floor(pos / stride), float2(0.0), uGrid - 1.0);
  float2 local = pos - rc * stride;

  // Rounded-box SDF, anti-aliased over ~1 dp.
  float2 halfSize = uCell * 0.5;
  float2 q = abs(local - halfSize) - (halfSize - RADIUS);
  float dist = length(max(q, float2(0.0))) + min(max(q.x, q.y), 0.0) - RADIUS;
  float mask = 1.0 - smoothstep(-0.5, 0.5, dist);

  // Per-cell peak and phase, same formulas as the desktop cells (row-major i).
  float i = rc.y * uGrid.x + rc.x;
  float peak = PEAK_MIN + (PEAK_MAX - PEAK_MIN) * cellNoise(i, 1.0);
  float jitter = (cellNoise(i, 2.0) - 0.5) * PHASE_JITTER * PERIOD;
  float diag = rc.x + (uGrid.y - 1.0 - rc.y); // bottom-left → top-right
  float maxDiag = max(1.0, uGrid.x + uGrid.y - 2.0);
  float phaseDelay = -((maxDiag - diag) / maxDiag) * PERIOD + jitter;
  float phase = fract((uTime - phaseDelay) / PERIOD);

  // Keyframes [min, min, peak, afterglow, min] @ [0, T1, T2, T3, 1] as a
  // branch-free mix chain — each smoothstep saturates before the next starts.
  float afterglowValue = ALPHA_MIN + (peak - ALPHA_MIN) * AFTERGLOW;
  float v = ALPHA_MIN;
  v = mix(v, peak, smoothstep(T1, T2, phase));
  v = mix(v, afterglowValue, smoothstep(T2, T3, phase));
  v = mix(v, ALPHA_MIN, smoothstep(T3, 1.0, phase));
  float cellAlpha = mix(v, STATIC_ALPHA, uStatic);

  float a = cellAlpha * FG_ALPHA * mask;
  return half4(half3(uColor * a), half(a)); // premultiplied
}
`;

const effect = Skia.RuntimeEffect.Make(PAINTING_SKELETON_GRID_SKSL);

if (!effect) {
  throw new Error('paintingSkeleton: failed to compile grid skeleton shader');
}

export const paintingSkeletonGridEffect = effect;
