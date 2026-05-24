# Headers

This module owns Expo Router header adapters used by the app screens.

## Public Interface

- `BackHeader`, `CloseHeader`, `MainHeader`, and `HeaderToolbarAction` are exported from `index.ts`.
- Callers should import from `@/components/headers`.

## Organization

- `BackHeader/`, `CloseHeader/`, and `MainHeader/` contain platform-specific header adapters.
- `components/` contains shared header UI primitives used by the Android adapters.
