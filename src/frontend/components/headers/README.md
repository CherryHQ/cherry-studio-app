# Headers

This module owns Expo Router header adapters used by the app screens.

## Public Interface

- `RouteHeader`, `RouteHeaderProvider`, `MainHeader`, `HeaderToolbarAction`, `HeaderActionGroup`,
  `HeaderChrome`, `HeaderIconButton`, and `headerScreenOptions` are exported from `index.ts`.
- Callers should import from `@/frontend/components/headers`.

## Organization

- Route layouts declare the root screen's leading behavior with `RouteHeaderProvider`. The root
  stack uses back and the chat-only drawer stack uses the drawer action.
- Only chat lives inside `app/(drawer)`, so only `MainHeader` can resolve to the drawer action.
  Business screens live in the root Stack, declare only titles, right-side actions, and exceptional
  back interception, and inherit back from the root provider. When no navigation history exists,
  the default back action replaces to `/`.
- The right side defaults to empty. Business screens choose `menu`, `icon`, or `label` according to
  the action semantics; multiple secondary actions belong in a menu, while save/done remain direct.
- `components/HeaderChrome` is the single native placement boundary. Android mounts actions through
  native-stack options, while iOS mounts the same actions through `Stack.Toolbar`.
- `components/HeaderAction` owns the explicit `icon`, `label`, `menu`, and `custom` action contract
  plus all standard top-action visuals and interaction states.
- `components/HeaderActionGroup` is the platform gateway for adjacent top actions. Callers declare
  placement, tone, and actions without choosing a platform: iOS delegates the group surface to the
  native toolbar, while Android draws the Cherry fallback surface.
- `MainHeader` keeps a thin platform adapter because Android draws the chat bar inside the scene,
  while iOS uses the native transparent toolbar. Both adapters mount the same action lists from
  `useMainHeaderActions`, so platform files only own how the surface is mounted.
- `headerScreenOptions` owns native top-header invariants. Top headers are separator-free on both
  platforms, and self-drawn headers do not add bottom borders or elevation.
- Top-bar controls share one Cherry action size and grouping contract. iOS lets the native toolbar
  draw its system background. Android supplies the matching fallback surface: one action forms a
  circle, while adjacent actions share one capsule. The visible surface stays 40dp inside
  non-overlapping 48dp Android touch targets. Default surfaces use theme tokens; inverse surfaces
  use constant contrast because they sit over uncontrolled media.
- `MainHeaderAgentButton` is the one exception to the black-icon rule: it carries the current
  Agent's avatar, so the chat identifies its Agent the same way the Agent list does.
