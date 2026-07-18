# Headers

This module owns Expo Router header adapters used by the app screens.

## Public Interface

- `BackHeader`, `CloseHeader`, `MainHeader`, `TabRootHeader`, `HeaderToolbarAction`, and
  `CloseHeaderAction` are exported from `index.ts`.
- Callers should import from `@/components/headers`.

## Organization

- `BackHeader/`, `CloseHeader/`, `MainHeader/`, and `TabRootHeader/` contain platform-specific
  header adapters.
- `components/` contains shared header UI primitives used by the Android adapters.
