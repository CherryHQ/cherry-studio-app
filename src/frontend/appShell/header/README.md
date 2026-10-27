# Headers

This module owns Expo Router header adapters used by the app screens.

## Public Interface

- `RouteHeader`, `RouteHeaderProvider`, `MainHeader`, `MainHeaderView`, `HeaderToolbarAction`, `HeaderActionGroup`,
  `HeaderChrome`, `HeaderIconButton`, and `headerScreenOptions` are exported from `index.ts`.
- Callers should import from `@/frontend/appShell/header`.

## Organization

- Route layouts declare the root screen's leading behavior with `RouteHeaderProvider`. The root
  stack uses back, the `(chat)` stack uses the drawer action, and the content region beside the
  sidebar uses back in compact windows and `none` in wide ones, where the persistent sidebar already
  moves between first-level pages. Any screen above a stack's root resolves to back, and a page that
  intercepts back keeps it even at a `none` root.
- Only `MainHeader` can resolve to the drawer action. Business screens declare only titles,
  right-side actions, and exceptional back interception, and inherit their leading action from the
  provider. When no navigation history exists, the default back action replaces to `/`.
- The right side defaults to empty. Business screens choose `menu`, `icon`, or `label` according to
  the action semantics; multiple secondary actions belong in a menu, while save/done remain direct.
- Management selection uses `RouteHeader.selection`: the header replaces the normal title and
  actions with the selected count and one leading exit action. Commit actions for forms and
  pickers remain feature-owned.
- `components/HeaderChrome` is the single native placement boundary. Android mounts actions through
  native-stack options, while iOS mounts the same actions through `Stack.Toolbar`. A page rendered in
  a side pane (see `PaneChromeProvider` in `appShell/layout`) has no native-stack screen, so the same
  props render as an inline row instead, and the route leading action yields to the pane's exit
  unless the page declares its own back step.
- `components/HeaderAction` owns the explicit `icon`, `label`, `menu`, and `custom` action contract
  plus all standard top-action visuals and interaction states.
- `components/HeaderActionGroup` is the platform gateway for adjacent top actions. Callers declare
  placement, tone, and actions without choosing a platform: iOS delegates the group surface to the
  native toolbar, while Android draws the Cherry fallback surface.
- `MainHeaderView` keeps a thin platform adapter because Android draws an ultra-thin blurred overlay
  above the scrolling chat scene, while iOS uses the native transparent toolbar. Android 12 and
  newer sample the chat surface through Expo Blur; older releases fall back to the material tint.
  The Android blur fades to fully transparent at the lower edge so it does not split the header and
  message canvas into separate visual surfaces. Both adapters mount the same action lists from
  `useMainHeaderActions`, so platform files only own how the surface is mounted.
- `headerScreenOptions` owns native top-header invariants. Top headers are separator-free on both
  platforms, and self-drawn headers do not add bottom borders or elevation.
- Top-bar controls share one Cherry action size and grouping contract. iOS lets the native toolbar
  draw its shared glass background where supported and adds token-colored translucent surfaces on
  older systems. Android supplies the matching fallback surface: one action forms a circle when it
  is an icon, while a label action and adjacent actions form a capsule. The visible surface stays
  36dp tall inside non-overlapping Android touch targets; short label targets keep a 64dp minimum
  width so their inset surface cannot collapse into a circle. Default surfaces use the card token
  and a compact shadow so their complete outline remains visible against the header; inverse
  surfaces use constant contrast because they sit over uncontrolled media.
- `MainHeaderAgentLabel` is the one exception to the black-icon rule: it carries the current
  Agent's avatar, so the chat identifies its Agent the same way the Agent list does. A compact
  avatar and medium-weight single-line name sit in a capsule beside the leading menu action on
  the left on both platforms, without a disclosure chevron. iOS lets the native toolbar own the
  glass material where supported, and older iOS versions add a progressive blur and translucent
  action surfaces behind the native toolbar; a spacer separates the capsule from the menu action.
  The Expo Router patch preserves spacer indices when converting header items, so native screens
  inserts each spacer between the intended custom views instead of before both buttons;
  Android draws a borderless translucent card tint over the header's existing blur,
  in the flexible space between the action groups. The capsule reuses that blur without another
  blur view or sampling target; Android versions below 12 retain the translucent material fallback.
  Long names truncate at the end. Both local and remote capsules open the same Agent picker, using the current
  source catalog and the existing local layout. Local callers supply editing and creation shortcuts;
  remote callers supply selection only. The sheet owns presentation and pagination controls, while
  callers own navigation and source observation. Unknown remote model metadata is not shown as an
  unconfigured model.

`MainHeader` supplies local Agent data to `MainHeaderView`; the remote chat supplies PC Agent data
to the same view. The source adapters do not duplicate platform chrome.

On iOS 26 and later, the chat header's icon actions that carry a `nativeIcon` (sidebar, file
workspace, new chat) render as standard `Stack.Toolbar.Button` items rather than custom views, so
the system can place them where the window keeps its controls: on an iPhone Duo, the vertical rail
under the status bar. The Agent capsule stays a custom view and remains at the top, as Apple's
guidance keeps labeled controls in the horizontal bar. The icons are template PNGs of the same
glyphs in `assets/header-toolbar`, generated by `pnpm exec tsx scripts/generateHeaderToolbarIcons.ts`.
Toolbar items are written as direct children of `Stack.Toolbar`, because Expo reads them before
rendering. Other pages keep custom views, and older systems keep the custom views with their
fallback surfaces.
