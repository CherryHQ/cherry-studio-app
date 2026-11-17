# Device connections

The page family owns settings navigation and its presentation. `DesktopPairingProvider` holds
transient invitation input. Its public `useDesktopPairingInput`, `useDesktopPairing`,
`usePairingInvitationInput`, and `useScannerPermissions` exports let onboarding route adapters
reuse system authorization and pairing behavior while rendering dedicated first-use screens.
`desktopConnectionErrorMessage` exposes existing translated recovery information to those adapters.
First-use adapters request a summary; detailed connection diagnostics remain available in settings.

Settings opens scan with push navigation, preserving the device list, connection detail or sidebar
source. Scan, pairing and retry replace one transient slot above that source. `usePairingNavigation`
owns cancellation: native and header back return to the retained source, with a connection/list
fallback for cold entries and an explicit list target when a repair connection disappeared.
Completion dismisses to an existing connection detail rather than stacking its duplicate; a new
connection replaces the transient step with its detail. Onboarding retains its own committed-step
navigation and continuation to provider import.
