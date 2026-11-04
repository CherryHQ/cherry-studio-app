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
  It uses `useLatestAgentSession` to recognize existing conversations, without selecting the chat
  destination. Background refreshes do not unmount the admitted chat.
- Chat routes without an explicit target open a draft for the last-used local Agent, stored in
  the persistent UI cache. The focused, non-preview chat records its Agent for both drafts and
  existing Sessions. Restoration queries the remembered Agent by ID, independently of list
  pagination. Only an absent saved selection or a successful empty lookup loads the first
  available Agent in list order; lookup failures remain retryable errors. Remote-device Agents
  never overwrite this local selection. It never restores a previous Session.
- `getRootHeaderStyle` and `getTransparentHeaderStyle` expose the platform policy consumed by root
  stack configuration.

## Organization

- `components/` contains app-wide providers and shared link adapters.
- `headerContentInset/` and `rootStackPlatform/` contain platform families kept private behind
  `index.ts`.
