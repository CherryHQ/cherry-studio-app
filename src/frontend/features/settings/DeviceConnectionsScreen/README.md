# Device connections

The page family owns settings navigation and its presentation. `DesktopPairingProvider` holds
transient invitation input. Its public `useDesktopPairingInput`, `useDesktopPairing`,
`usePairingInvitationInput`, and `useScannerPermissions` exports let onboarding route adapters
reuse system authorization and pairing behavior while rendering dedicated first-use screens.
`desktopConnectionErrorMessage` exposes existing translated recovery information to those adapters.
First-use adapters request a summary; detailed connection diagnostics remain available in settings.
