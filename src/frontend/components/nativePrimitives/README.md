# Native Primitives

This module owns style-system adapters for native UI dependencies that are used across screens.

## Public Interface

- `Image` wraps `expo-image` with Uniwind class-name support.
- `LinearGradient` wraps `expo-linear-gradient` with Uniwind class-name support.
- Callers import from `@/frontend/components/nativePrimitives` rather than the underlying packages.

## Organization

- `components/` contains one adapter per native primitive.
- `index.ts` is a pure public re-export surface.
