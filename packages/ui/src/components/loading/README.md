# Loading

This component family owns Cherry UI loading and ongoing-work indicators. It exports the standard
`Spinner`, the image-rendering status surface `ImageGenerationLoader`, `PrismSweep`, and four
numbered dot-matrix loaders ported from the source design set: `DotMatrixSquare2`,
`DotMatrixSquare6`, `DotMatrixSquare19`, and `DotMatrixSquare20`.

## ImageGenerationLoader

`ImageGenerationLoader` is the pending state for generated images, in one treatment at every size:
a dot field with a soft diagonal glare, plain resolution text, and shimmering status copy inside
the canvas. The short edge spans 19 cells, preserving dot spacing on rectangular previews. Callers
can provide `active`, `height`, `label`, `resolution`, `size`, `width`, and standard `View` props.
`resolution` is optional — the label is dropped when the request never named a size — and hosts that
already speak for the loader (a gallery tile, say) pass `accessible={false}`.

- One Skia runtime shader draws the dot field and reflection in a single GPU pass, with no
  per-dot React Native views or extra blur layer.
- The glare indicates ongoing generation, not completion percentage. Each 4.8-second cycle sweeps
  diagonally across the surface for 3.84 seconds, then rests off-canvas for 0.96 seconds. Point-based
  projection keeps the reflection's angle consistent across preview aspect ratios.
- Reanimated drives the shader clock and shared `ShimmerText` sweep on the UI thread.
- Deactivation stops and resets the clock immediately. Inactive and Reduce Motion states show
  static dots without glare; the existing image handoff owns the final result transition.
- Colors come from Cherry's semantic Uniwind tokens, so scoped and app-selected themes both work.
- A neutral secondary surface and subtle border frame the field. Highlighted dots and resolution
  text use secondary ink; the resolution has no separate capsule, fill, or border. The reflection
  uses the constant-white token at 60% in light themes and 10% in dark themes to limit its contrast.
- Product call sites should pass translated `label` and `accessibilityLabel` values.

## Dot matrix foundation

The dot-matrix loaders share the private `DotMatrixBase`. It owns the fixed 5x5 geometry, one
Reanimated clock, Reduce Motion handling, accessibility, sizing, and dot styling. Each public loader
owns only its cycle duration, traversal, and precomputed opacity frames; the base interface is not
exported.

All dot-matrix loaders accept `active`, `size`, `dotClassName`, and `accessibilityLabel`. Their
default size is 20 points.

## PrismSweep

`PrismSweep` renders a 5x5 dot matrix whose trail follows alternating anti-diagonals. It accepts
`active`, `size`, `dotClassName`, and `accessibilityLabel`.

- One Reanimated shared value drives the entire loop on the UI thread.
- The continuous cycle uses `easing.linear` from the package motion vocabulary.
- Reduce Motion stops the clock and leaves a readable static grid.
- Dots are positioned directly in one container, avoiding a layout wrapper per cell.
- Opacity worklets read an 84-frame table instead of recalculating the sweep curve every frame.

`diagonal-sweep-order.ts` owns the pure snake traversal used by the indicator.

## Numbered loaders

- `DotMatrixSquare2` follows a 33-step weaving path with an eight-dot tail.
- `DotMatrixSquare6` runs five synchronized column trails in alternating directions.
- `DotMatrixSquare19` sends two heads around a sampled figure-eight path.
- `DotMatrixSquare20` chases the perimeter in both directions with corner and center accents.

All loaders precompute their opacity frames at module load. Runtime worklets only select a frame and
cell, so no React state updates or per-frame arrays are created.
