# Drawer

This module owns the app drawer shell, topic list, drawer search state, and navigation bridge.

## Public Interface

- `DrawerRoot` wraps the root stack with `DrawerProvider`.
- `DrawerLayout` renders the Expo drawer for the drawer route group.
- Drawer state hooks are exported from `index.ts` for drawer-aware modules such as headers.

## Organization

- `components/` contains drawer-only UI pieces.
- `context/` owns drawer state, topic loading, and drawer navigation bridge hooks.
- `hooks/` contains layout/animation hooks.
- `utils/` contains animation configuration shared by drawer components and hooks.
