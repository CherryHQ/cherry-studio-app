# Sidebar And Navigation

Application shell combining the conversation drawer (`testID:sidebar`, docked beside chat on wide
screens), floating bottom navigation dock (`testID:floating-nav-dock`), foldable trailing rail
(`testID:vertical-nav-rail`), permanent wide icon rail (`testID:wide-nav-rail`), More hub, and
caller-preserving sign-in/setup return flows.

## User Entry

- Open drawer from chat header button `testID:main-header-open-sidebar` (or swipe from screen edge;
  docked beside chat on wide window classes).
- Sidebar root: `testID:sidebar`.
- Header controls: search trigger `testID:sidebar-search` (opens `testID:app-search-input` /
  `testID:app-search-close`) and device switcher `testID:sidebar-device-switcher`.
- Sidebar destination entries: `testID:sidebar-scheduled-tasks`, `testID:sidebar-settings`.
- Tap the profile row or its gear to open Settings. For an active paid subscription, the avatar ring
  and its caption (`testID:sidebar-plan-badge`) cycle through the plan and each quota window.
  [Light and dark drawer footers](../../.github/images/sidebar/profile-footer.png)
- Compact floating dock (`testID:floating-nav-dock`) and foldable trailing rail
  (`testID:vertical-nav-rail`): top-level tabs (`floating-nav-tab-<id>` / `vertical-rail-tab-<id>`
  for chat, pinned tabs, and More); More hub module cards (`testID:more-module-card-drawings`,
  `testID:more-module-card-plugins`, `testID:more-module-card-marketplace`,
  `testID:more-module-card-files`, `testID:more-module-card-devices`), `testID:more-settings-button`,
  and pin popover (`testID:nav-pin-popover`).
- Wide icon rail (`testID:wide-nav-rail`): `testID:wide-rail-tab-chat`,
  `testID:wide-rail-tab-agents`, `testID:wide-rail-tab-drawings`, `testID:wide-rail-tab-plugins`,
  `testID:wide-rail-tab-marketplace`, `testID:wide-rail-tab-files`, `testID:wide-rail-tab-devices`,
  and `testID:wide-rail-settings`.
- Recents list controls: `testID:sidebar-recents-mode-toggle`, `testID:sidebar-select-all`.

## Verification Driver

- Focused Jest suites:
  - `pnpm test:app -- src/frontend/appShell/sidebar/components/__tests__/SidebarProfileButton.test.tsx --runInBand`
  - `pnpm test:app -- src/frontend/features/search/__tests__/useAppSearchResults.test.ts --runInBand`
- Device acceptance: `agent-device` round-trip opening `testID:sidebar`, switching destinations,
  verifying the avatar arc matches the remaining percentage on `testID:sidebar-plan-badge`, and returning via back gesture / Android
  hardware back.

## Observable Acceptance

- Opening the sidebar displays `testID:sidebar`, shows the cached subscription when available,
  and navigates cleanly to each destination without leaving orphaned overlays.
- Completing sign-in or provider setup triggered from a nested route returns to the caller route
  instead of dumping the user back to an unexpected root screen.
- On Android, hardware back dismisses open sheets/layers before popping the underlying route.

## Known Pitfalls

- Wide screens and foldables dock the sidebar beside chat (`useCanDockSidebar`, `FoldRegionProvider`);
  test both compact drawer mode and wide split layouts when changing shell navigation.
- Retained native navigation views can still exist in the view hierarchy after dismissal; verify
  both destination disappearance (`kind: "absent"`) and original screen landmark visibility in
  `agent-device` round-trips.
