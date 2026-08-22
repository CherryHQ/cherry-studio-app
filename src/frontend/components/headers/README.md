# Headers

This module owns Expo Router header adapters used by the app screens.

## Public Interface

- `RouteHeader`, `RouteHeaderProvider`, `MainHeader`, `HeaderToolbarAction`, `HeaderChrome`,
  `HeaderIconButton`, and `headerScreenOptions` are exported from `index.ts`.
- Callers should import from `@/frontend/components/headers`.

## Organization

- Route layouts declare the root screen's leading behavior with `RouteHeaderProvider`. The root
  stack uses back, the drawer stack uses the drawer action, and exceptional full-screen routes can
  explicitly use close.
- `RouteHeader` automatically changes drawer-stack child screens to back. Business screens declare
  only titles, right-side actions, and exceptional back interception.
- The right side defaults to empty. Business screens choose `menu`, `icon`, or `label` according to
  the action semantics; multiple secondary actions belong in a menu, while save/done remain direct.
- `components/HeaderChrome` is the single native placement boundary. Android mounts actions through
  native-stack options, while iOS mounts the same actions through `Stack.Toolbar`.
- `components/HeaderAction` owns the explicit `icon`, `label`, `menu`, and `custom` action contract
  plus all standard top-action visuals and interaction states.
- `MainHeader` keeps a thin platform adapter because Android draws the chat bar inside the scene,
  while iOS uses the native transparent toolbar. Both adapters resolve their leading action from
  the same route policy and use the same `HeaderAction` family.
- `headerScreenOptions` owns native top-header invariants. Top headers are separator-free on both
  platforms, and self-drawn headers do not add bottom borders or elevation.
- Top-bar controls share one Cherry visual on both platforms: icon actions use a 40-point white
  circle with a black icon, while text actions use the matching white pill with black text. iOS
  toolbar adapters hide the system-provided shared background before mounting these controls.
