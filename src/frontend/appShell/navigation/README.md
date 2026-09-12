# Navigation

This module owns Expo Router and React Navigation integration shared by the app shell and page
domains.

## Public Interface

- `NavigationThemeProvider` supplies the app-wide navigation theme.
- `ContextMenuLink` and `ContextMenuLinkItem` define the shared link-with-context-menu adapter.
- `resolveHeaderContentInset` normalizes native and custom-overlay header insets for full-screen
  content.
- `providerSetupHref`, `readProviderSetupReturnTo`, and `useOpenProviderSetup` carry a requesting
  internal href through provider setup without introducing a global workflow coordinator.
  These entry points always open regular provider settings. First-use routes opt into their
  setup presentation explicitly; URL parameters cannot activate it from ordinary settings.
- `FirstUseGate` owns first-use admission before restoring a chat target. It preserves existing
  installations and lets skipped/completed users enter chat normally.
  It reuses `useLatestAgentSession` so admission and chat restoration share the same paginated
  cache shape. Background refreshes do not unmount the admitted chat.
- `getRootHeaderStyle`, `getTransparentHeaderStyle`, and `paintingViewerHeaderShown` expose the
  platform policy consumed by root stack configuration.

## Organization

- `components/` contains app-wide providers and shared link adapters.
- `headerContentInset/` and `rootStackPlatform/` contain platform families kept private behind
  `index.ts`.
