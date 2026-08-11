# Loading

This component family owns Cherry UI loading and ongoing-work indicators. It exports the standard
`Spinner`, the image-rendering status surface `ImageGenerationLoader`, `PrismSweep`, and four
numbered dot-matrix loaders ported from the source design set: `DotMatrixSquare2`,
`DotMatrixSquare6`, `DotMatrixSquare19`, and `DotMatrixSquare20`.

## ImageGenerationLoader

`ImageGenerationLoader` is the pending state for generated images, in one treatment at every size:
a 19x19 dot field with a resolution badge and shimmering status copy inside the canvas. Callers can
provide `active`, `height`, `label`, `resolution`, `size`, `width`, and standard `View` props.
`resolution` is optional — the badge is dropped when the request never named a size — and hosts that
already speak for the loader (a gallery tile, say) pass `accessible={false}`.

- One Skia runtime shader draws the background field and both moving ellipse masks in a single GPU
  pass. Building the same mask from React Native views would require hundreds of mounted nodes.
- Reanimated drives the shader clock and shared `ShimmerText` sweep on the UI thread.
- The clock pauses and resets while inactive, and Reduce Motion renders a readable static frame.
- Colors come from Cherry's semantic Uniwind tokens, so scoped and app-selected themes both work.
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
