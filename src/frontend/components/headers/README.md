# Headers

This module owns Expo Router header adapters used by the app screens.

## Public Interface

- `BackHeader`, `CloseHeader`, `MainHeader`, `DrawerRootHeader`, `HeaderToolbarAction`,
  `HeaderChrome`, `HeaderIconButton`, `headerScreenOptions`, and `useOpenDrawer` are exported from
  `index.ts`.
- Callers should import from `@/frontend/components/headers`.

## Organization

- `BackHeader`, `CloseHeader`, and `DrawerRootHeader` are shared semantic wrappers. Screens declare
  only their title and actions; these wrappers do not contain platform styling.
- `components/HeaderChrome` is the single native placement boundary. Android mounts actions through
  native-stack options, while iOS mounts the same actions through `Stack.Toolbar`.
- `components/HeaderAction` owns the explicit `icon`, `label`, `menu`, and `custom` action contract
  plus all standard top-action visuals and interaction states.
- `MainHeader` keeps a thin platform adapter because Android draws the chat bar inside the scene,
  while iOS uses the native transparent toolbar. Both adapters use the same `HeaderAction` family.
- `headerScreenOptions` owns native top-header invariants. Top headers are separator-free on both
  platforms, and self-drawn headers do not add bottom borders or elevation.
- Top-bar controls share one Cherry visual on both platforms: icon actions use a 40-point white
  circle with a black icon, while text actions use the matching white pill with black text. iOS
  toolbar adapters hide the system-provided shared background before mounting these controls.
