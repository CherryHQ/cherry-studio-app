# Cherry account login

Settings → Cherry account opens the hosted account service in the system authentication browser.
After identity verification, the portal creates or reuses the sole community account and always
shows the destination chooser, including when the user has no organization or only one organization.
Selecting a destination completes OAuth and product entry before returning to the app home screen.
Creating an organization uses the enterprise website; return to the chooser and refresh its list.
A cancelled browser or failed product entry never becomes a successful app login.

## Configuration

Set all `EXPO_PUBLIC_CHERRY_LOGIN_*` values from `.env.example` for one environment. These are public
build configuration, not credentials. `PROJECT_IDS` is a comma-separated list of the Cloud and
enterprise Zitadel project IDs used as token audiences. An incomplete configuration leaves the
entry unavailable and makes no authentication request.

The callback comes from the existing app-variant scheme and `auth/cherry-callback`, for example
`cherrystudio-dev://auth/cherry-callback` in development. Register that exact URI on the native OIDC
client and use the same URI in the portal login client configuration before releasing the build.
Do not configure an HTTPS callback unless the app's verified universal/app links are also deployed.

The SDK is headless. Backend-owned storage keeps OAuth credentials in Expo SecureStore; the UI only
receives destination, display name and status. Cloud device signing uses a separate Ed25519 key in
SecureStore and the platform's app-scoped device identifier. No private key is sent to the server.
The existing app runtime owns initialization, cancellation and disposal. Restoring a signed-in
session does not reopen the destination chooser. Switching destinations explicitly starts login.

## Profile boundaries

Account profile editing opens `/profile` on the hosted portal. Display name is editable; username is
shown separately. Enterprise member overrides and organization name/logo are managed in the
enterprise account center. CN community Web product entry remains disabled; the hosted identity
profile editor is not a community product account center.

## Acceptance

Run focused CherryAccountRuntime and bootstrap runtime tests, plus lint, typecheck, format and i18n
checks. Native acceptance must additionally cover iOS and Android system-browser return, cancellation,
app restart, community and enterprise entry, and profile editing. Follow
[Parallel Device Testing](./parallel-device-testing.md) for device ownership and client compatibility.
Unit tests do not establish callback registration or operating-system deep-link behavior.
