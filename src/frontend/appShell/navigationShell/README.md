# Navigation Shell

This App Shell module owns the responsive root navigation chrome (compact floating dock, tablet
vertical rail, and wide-window rail), shared route manifest, dock pinning/drag state, and dock
clearance hooks.

## Public Interface

- `@/frontend/appShell/navigationShell` exports the navigation shell provider, UI surfaces
  (`FloatingNavDock`, `FloatingDragOverlay`, `VerticalNavRail`, `WideNavRail`, `NavPinPopover`,
  `NavIcon`, `NavCardBadge`, `NavRouteHeaderScope`), navigator registration helpers, and the
  public state hooks and layout constants. Raw React context objects stay omitted from the barrel.
- `@/frontend/appShell/navigationShell/state` is the pure/hook sub-entry for features, shared
  components, sibling App Shell modules, and tests that read shell mode, route specs
  (`NAV_ROUTE_MANIFEST`, `SidebarNavDestination`), dock clearance hooks, or context providers
  without loading the dock and rail UI components.
- Internal helpers (`dockTabs`, `navRouteManifest`, `shellMode`, `NavTabStrip`) remain private to
  the module; external callers must not import internal leaves directly.
