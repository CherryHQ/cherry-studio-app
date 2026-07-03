# Prism Sweep

This module owns a reusable animated 5x5 dot-matrix indicator: a snake-style
trail sweeps across alternating anti-diagonals, useful as a lightweight
"working" indicator (e.g. a model thinking/streaming state).

This is an original Reanimated implementation inspired by the visual idea of
a diagonal dot-matrix sweep. It does not reuse code from any third-party
component library.

## Public Interface

- `PrismSweep` renders the animated dot grid. Props: `active` (runs the sweep
  vs. settling to a dim static grid), `size`, `durationMs`, `dotClassName`
  (Tailwind classes for dot color), `accessibilityLabel`.

## Organization

- `components/PrismSweep.tsx` lays out the 5x5 grid and drives a single
  shared Reanimated clock for all dots.
- `components/PrismSweepDot.tsx` derives one dot's opacity from the shared
  clock and its position in the sweep order.
- `utils/diagonalSweepOrder.ts` computes the pure per-cell sweep order
  (anti-diagonal traversal, direction alternating each diagonal).

## Behavior notes

- Respects `useReducedMotion()`: when reduced motion is preferred, dots stay
  static and dim instead of animating.
- All dots share one Reanimated clock (`progress`) driven by `withRepeat`;
  per-dot look is a pure function of `progress` and the dot's position in the
  sweep order, so adding/removing dots never needs new hooks per dot beyond
  the fixed 25.
