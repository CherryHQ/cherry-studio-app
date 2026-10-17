# Loading

This component family owns Cherry UI loading and ongoing-work indicators. It exports the standard
`Spinner`, the image-rendering status surface `ImageGenerationLoader`, `PrismSweep`, and four
numbered dot-matrix loaders ported from the source design set: `DotMatrixSquare2`,
`DotMatrixSquare6`, `DotMatrixSquare19`, and `DotMatrixSquare20`.

## Spinner

The shared `Spinner` contract keeps sizes (16/24/32 points), semantic or explicit colors, and
caller-supplied accessibility labels. Its private Android adapter uses native indeterminate
progress. Reanimated-driven rotation repeatedly triggered Fabric commit exhaustion during remote
history loading on Android; native progress avoids per-frame ShadowTree commits. Reduced Motion
uses a static indicator. iOS and the tooling/web fallback retain the existing HeroUI rendering.
Platform selection stays inside CherryUI; local and remote screens use the same public component.

## ImageGenerationLoader

`ImageGenerationLoader` is the pending state for generated images, in one treatment at every size:
a holo card whose light sweeps across it. The card carries no text — the moving light already says
the image is on its way. Callers can provide `active`, `height`, `size`, `width`, and standard `View`
props. Product call sites pass a translated `accessibilityLabel`; hosts that already speak for the
loader (a gallery tile, say) pass `accessible={false}`.

- One Skia runtime shader draws three layers in a single GPU pass: a faint pastel pearl sheen over
  the whole card, fine spectral foil lines that only the passing light reveals, and a white glare
  with sparkles. The look follows the shine/glare layering of
  [Pokémon Cards CSS](https://github.com/zhangjiadi225/pokemon-cards-css); the canvas stays still.
- The light indicates ongoing generation, not completion percentage. Every 2.4 seconds it crosses
  diagonally from one off-card corner to the other and fades at both ends of the cycle, so the
  restart never jumps and the card is never blank. Point-based projection keeps the angle consistent
  across preview aspect ratios.
- The spectrum is procedural; it is not a brand or status color. The shader reads the
  `--color-background` token's luminance to dim the pearl and deepen the foil on dark themes, so
  scoped and app-selected themes both work.
- Reanimated drives the shader clock on the UI thread.
- Deactivation, backgrounding, and Reduce Motion stop the clock and show the neutral canvas without
  light; the existing image handoff owns the final result transition.
- A neutral secondary surface and subtle border frame the card.

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
