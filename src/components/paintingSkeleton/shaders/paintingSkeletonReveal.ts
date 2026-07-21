import { Skia } from '@shopify/react-native-skia';

import { paintingSkeleton } from '@/config/constants';

/**
 * Full-lifecycle SkSL for the painting skeleton: the Act 1 loading grid (a
 * superset of paintingSkeletonGrid.ts, same constants) plus the desktop Act 2-4
 * image reveal, all in one pass with the result image bound as a child shader.
 *
 * Reveal (driven by `uReveal`, seconds; < 0 = pure loading):
 * - Act 2 tint: as a diagonal wave reaches each cell it fades a flat per-cell
 *   color (sampled at the cell center) over the still-pulsing grey grid.
 * - Act 3 slice: a second wave, chasing the tint by `sliceChase`, fades in the
 *   real pixels. The slice samples on a pitch-strided grid (cells + gaps), so
 *   the ~5 dp gutters stay uncovered — that reduces to scaling the sample
 *   coordinate by inner / (inner + gap).
 * - Act 4 heal: a full-cover image fades in over everything to fill the gutters.
 *
 * Compositing is premultiplied `over`; transparent output shows the muted box
 * behind the Canvas. `uFieldAlpha` fades the whole field for the demo loop.
 * The result image is assumed opaque (alpha ≈ 1), so eval().rgb is its color.
 */
const f = (n: number) => (Number.isInteger(n) ? `${n}.0` : `${n}`);

const k = paintingSkeleton;
const [t1, t2, t3] = k.keyframeTimes;
const r = k.reveal;

export const PAINTING_SKELETON_REVEAL_SKSL = `
uniform float uTime;      // loading clock, pre-wrapped to [0, PERIOD)
uniform float2 uGrid;     // (cols, rows)
uniform float2 uCell;     // (cellWidth, cellHeight) dp
uniform float2 uInner;    // inner box size dp (canvas covers exactly this)
uniform float3 uColor;    // foreground rgb, normalized
uniform float uReveal;    // reveal seconds; < 0 = pure Act 1 loading
uniform float uFieldAlpha;// whole-field opacity for the demo loop
uniform shader uImage;    // result image, filled to the inner rect

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
const float FG_ALPHA = ${f(k.foregroundAlpha)};
const float TINT_SWEEP = ${f(r.tintSweep)};
const float TINT_DUR = ${f(r.tintDur)};
const float TINT_MAX = ${f(r.tintMax)};
const float SLICE_CHASE = ${f(r.sliceChase)};
const float SLICE_FADE = ${f(r.sliceFade)};
const float HEAL_START = ${f(r.healStart)};
const float HEAL_FADE = ${f(r.healFade)};

float cellNoise(float i, float salt) {
  return fract(sin(i * 12.9898 + salt * 78.233) * 43758.5453);
}

half4 main(float2 pos) {
  float2 stride = uCell + GAP;
  float2 rc = clamp(floor(pos / stride), float2(0.0), uGrid - 1.0);
  float2 local = pos - rc * stride;

  float2 halfSize = uCell * 0.5;
  float2 q = abs(local - halfSize) - (halfSize - RADIUS);
  float dist = length(max(q, float2(0.0))) + min(max(q.x, q.y), 0.0) - RADIUS;
  float mask = 1.0 - smoothstep(-0.5, 0.5, dist);

  // Act 1 loading glow (grey grid).
  float i = rc.y * uGrid.x + rc.x;
  float peak = PEAK_MIN + (PEAK_MAX - PEAK_MIN) * cellNoise(i, 1.0);
  float jitter = (cellNoise(i, 2.0) - 0.5) * PHASE_JITTER * PERIOD;
  float diag = rc.x + (uGrid.y - 1.0 - rc.y);
  float maxDiag = max(1.0, uGrid.x + uGrid.y - 2.0);
  float phaseDelay = -((maxDiag - diag) / maxDiag) * PERIOD + jitter;
  float phase = fract((uTime - phaseDelay) / PERIOD);
  float afterglowValue = ALPHA_MIN + (peak - ALPHA_MIN) * AFTERGLOW;
  float v = ALPHA_MIN;
  v = mix(v, peak, smoothstep(T1, T2, phase));
  v = mix(v, afterglowValue, smoothstep(T2, T3, phase));
  v = mix(v, ALPHA_MIN, smoothstep(T3, 1.0, phase));
  float loadA = v * FG_ALPHA * mask;

  // Premultiplied accumulation over a transparent base (muted box shows through).
  half3 outP = half3(uColor) * loadA;
  float outA = loadA;

  if (uReveal >= 0.0) {
    float tintStart = (diag / maxDiag) * TINT_SWEEP;
    float tintP = smoothstep(0.0, 1.0, clamp((uReveal - tintStart) / TINT_DUR, 0.0, 1.0)) * TINT_MAX;
    float sliceStart = tintStart + SLICE_CHASE;
    float sliceP = smoothstep(0.0, 1.0, clamp((uReveal - sliceStart) / SLICE_FADE, 0.0, 1.0));
    float healP = smoothstep(0.0, 1.0, clamp((uReveal - HEAL_START) / HEAL_FADE, 0.0, 1.0));

    // Act 2: flat per-cell color, sampled at the cell center.
    float2 center = clamp((rc + 0.5) * stride, float2(0.0), uInner - 0.5);
    half3 avg = uImage.eval(center).rgb;
    // Act 3: real pixels on a pitch-strided grid (leaves the gutters).
    half3 slice = uImage.eval(pos * uInner / (uInner + GAP)).rgb;
    // Act 4: full-cover image fills the gutters.
    half3 heal = uImage.eval(pos).rgb;

    float tA = tintP * mask;
    outP = avg * tA + outP * (1.0 - tA);
    outA = tA + outA * (1.0 - tA);
    float sA = sliceP * mask;
    outP = slice * sA + outP * (1.0 - sA);
    outA = sA + outA * (1.0 - sA);
    outP = heal * healP + outP * (1.0 - healP);
    outA = healP + outA * (1.0 - healP);
  }

  return half4(outP * uFieldAlpha, half(outA * uFieldAlpha));
}
`;

const effect = Skia.RuntimeEffect.Make(PAINTING_SKELETON_REVEAL_SKSL);

if (!effect) {
  throw new Error('paintingSkeleton: failed to compile grid reveal shader');
}

export const paintingSkeletonRevealEffect = effect;
