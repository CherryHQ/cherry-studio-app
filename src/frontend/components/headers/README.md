# Headers

This module owns Expo Router header adapters used by the app screens.

## Public Interface

- `BackHeader`, `CloseHeader`, `MainHeader`, `DrawerRootHeader`, `HeaderToolbarAction`,
  `CloseHeaderAction`, `HeaderIconButton`, and `useOpenDrawer` are exported from `index.ts`.
- Callers should import from `@/frontend/components/headers`.

## Organization

- `BackHeader/`, `CloseHeader/`, `MainHeader/`, and `DrawerRootHeader/` contain platform-specific
  header adapters. `MainHeader` and `DrawerRootHeader` lead with a hamburger that opens the global
  drawer (`useOpenDrawer`).
- `components/` contains shared header UI primitives used by the Android adapters and by screens
  that draw their own header (settings).
