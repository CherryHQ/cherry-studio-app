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

`PaintingCanvas` mounts the skeleton during generation and drives the reveal
after the generated image is available. The caller owns the reveal timing.

## Public interface

- `PaintingSkeleton` — fills its parent (`flex-1`), measures itself via
  `onLayout`, and draws on a muted rounded box. Props: `image?` (result image to
  reveal into; omit for a pure loading grid), `reveal?` (reveal seconds as a
  `DerivedValue<number>`, required with `image`),
  `accessibilityLabel` (defaults to `"Loading"`), `testID`.

`reveal < 0` is pure Act 1 loading; non-negative seconds advance Acts 2-4.

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
