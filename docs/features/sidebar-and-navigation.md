# Sidebar And Navigation

Application shell navigation drawer (or docked tablet/foldable pane) providing access to recents,
global search, device/desktop switching, Cloud subscription quota, top-level feature destinations,
and caller-preserving sign-in/setup return flows.

## User Entry

- Open drawer from chat header button `testID:main-header-open-sidebar` (or swipe from screen edge;
  docked automatically on wide window classes).
- Sidebar root: `testID:sidebar`.
- Header controls: search trigger `testID:sidebar-search` (opens `testID:app-search-input` /
  `testID:app-search-close`), device switcher `testID:sidebar-device-switcher`, Cloud plan badge
  `testID:sidebar-plan-badge`.
- Destination entries: `testID:sidebar-agents`, `testID:sidebar-paintings`, `testID:sidebar-plugins`,
  `testID:sidebar-skills`, `testID:sidebar-library`, `testID:sidebar-scheduled-tasks`,
  `testID:sidebar-settings`.
- Recents list controls: `testID:sidebar-recents-mode-toggle`, `testID:sidebar-select-all`.

## Verification Driver

- Focused Jest suites:
  - `pnpm test:app -- src/frontend/features/search/__tests__/useAppSearchResults.test.ts --runInBand`
- Device acceptance: `agent-device` round-trip opening `testID:sidebar`, switching destinations,
  verifying `testID:sidebar-plan-badge` quota refresh, and returning via back gesture / Android
  hardware back.

## Observable Acceptance

- Opening the sidebar displays `testID:sidebar`, refreshes Cloud subscription quota when signed in,
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
