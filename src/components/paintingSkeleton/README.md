# paintingSkeleton

Loading grid skeleton for painting/drawing surfaces: a measured cols×rows grid
of rounded cells whose brightness peak sweeps diagonally from the bottom-left
to the top-right. It is a 1:1 port of the desktop paintings skeleton
(`renderer/pages/paintings/components/PaintingSkeletonGrid.tsx`) — same grid
measurement, per-cell hash, keyframe curve and colors — reimplemented as SkSL
passes instead of one animated DOM node per cell.

The full desktop lifecycle is ported:

- **Act 1 · loading** — the diagonal glow wave (`shaders/paintingSkeletonGrid.ts`).
- **Act 2-4 · reveal** — once a result image arrives the grid tints (per-cell
  average color), fades in real per-cell slices chasing the tint wave, then a
  full image heals the gutters (`shaders/paintingSkeletonReveal.ts`, with the
  image bound as a Skia `ImageShader`).

## Ownership

Reserved for the (upcoming) drawing feature — implemented and verified, with no
mount yet. The feature wires it in by passing a generated `image` and driving
`reveal` from generation progress. The `reveal` API is controlled, so callers
own the driver (there is intentionally no built-in loop).

## Public interface

- `PaintingSkeleton` — fills its parent (`flex-1`), measures itself via
  `onLayout`, and draws on a muted rounded box. Props: `image?` (result image to
  reveal into; omit for a pure loading grid), `reveal?` (a `DerivedValue<RevealCycle>`
  driver — reveal seconds + field opacity — required with `image`),
  `accessibilityLabel` (defaults to `"Loading"`), `testID`.
- `RevealCycle` — `{ reveal: number; fieldAlpha: number }`; `reveal < 0` is pure
  Act 1 loading, `reveal` in seconds advances Acts 2-4.

## Organization

- `components/PaintingSkeleton.tsx` — layout measurement, theme color,
  Reduce Motion gate (static snapshot, clock stopped), Canvas wiring, and the
  loading-vs-reveal shader switch.
- `shaders/paintingSkeletonGrid.ts` — Act 1 loading grid SkSL.
- `shaders/paintingSkeletonReveal.ts` — Act 1-4 lifecycle SkSL (loading grid +
  tint/slice/heal reveal), result image bound as a child `ImageShader`.
- `utils/gridLayout.ts` — pure grid measurement (desktop algorithm).

All tuning knobs live in `paintingSkeleton` in `src/config/constants.ts` —
adjust there, not here.
