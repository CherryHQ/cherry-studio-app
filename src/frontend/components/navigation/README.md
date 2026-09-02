# Navigation

This module owns Expo Router and React Navigation integration shared by the app shell and feature
domains.

## Public Interface

- `NavigationThemeProvider` supplies the app-wide navigation theme.
- `ContextMenuLink` and `ContextMenuLinkItem` define the shared link-with-context-menu adapter.
- `resolveHeaderContentInset` normalizes platform header insets for full-screen content.
- `providerSetupHref`, `readProviderSetupReturnTo`, and `useOpenProviderSetup` carry a requesting
  internal href through provider setup without introducing a global workflow coordinator.
- `getRootHeaderStyle`, `getTransparentHeaderStyle`, and `paintingViewerHeaderShown` expose the
  platform policy consumed by root stack configuration.

## Organization

- `components/` contains app-wide providers and shared link adapters.
- `headerContentInset/` and `rootStackPlatform/` contain platform families kept private behind
  `index.ts`.
