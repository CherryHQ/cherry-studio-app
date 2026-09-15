# Gmail Authorization

Local Expo module owned by the Gmail plugin. iOS uses Google Sign-In 9; Android uses
Google Identity Services AuthorizationClient from Play Services Auth 22.

- `authorize(email, true)` may present Google's account and consent UI after an explicit connect
  action. `authorize(email, false)` obtains a token for the connected account without presenting UI;
  missing consent returns `E_GMAIL_AUTHORIZATION`.
- `revoke(email)` revokes the application's Google grants for that account. The plugin removes its
  local connection before attempting remote revocation and reports an unconfirmed result on failure.
- `clearToken(token)` invalidates a rejected Android cached token. On iOS it signs out the matching
  session because Google Sign-In exposes no individual token-cache invalidation method.
- Only access tokens and granted scope names cross into the backend. Google owns renewal state in
  its native credential storage. Account identity is checked against Gmail's mailbox profile.
- The native module allows one authorization/revocation operation at a time. Google's UI owns
  cancellation; the backend aborts its wait on interruption and never commits a late result. A
  pending connection attempt does not resume after process restart. Saved connections restore
  silently only on tool use.

## Developer Configuration

Register the app variants with the same Google Cloud project and enable Gmail API with
`https://www.googleapis.com/auth/gmail.readonly`. These are application-owned settings; users do not
enter credentials or host callback pages.

For iOS, set these build environment variables for the chosen `PROFILE`:

```dotenv
GMAIL_IOS_CLIENT_ID=<iOS OAuth client ID>
GMAIL_IOS_BUNDLE_IDENTIFIER=com.cherryai.cherrystudio-app.dev
```

Use the exact bundle identifier in `app.json` plus the selected profile suffix. `app.config.ts`
checks the supplied identifier against the selected variant, writes `GIDClientID`, and registers
the reversed client ID URL scheme. An omitted configuration leaves Gmail unavailable on iOS.
The downloaded iOS plist is optional: its client ID and bundle ID supply these values. No Web
client secret, Firebase configuration, or server client ID is used.

Android needs a registered OAuth Android client matching the installed package name and signing
certificate SHA-1. AuthorizationClient resolves it from that identity; no client JSON or client ID
is embedded. Devices need Google Play services. Register each development, preview and production
package/signing-certificate combination that will use Gmail.

Changes to this module or the iOS URL scheme require a new native development client; a JavaScript
update cannot install native dependencies. Follow [Local EAS Builds](../../docs/guides/local-builds.md)
when packaging is explicitly requested.

References: [Google Sign-In for iOS](https://developers.google.com/identity/sign-in/ios/start-integrating),
[iOS API access](https://developers.google.com/identity/sign-in/ios/api-access),
[Android authorization](https://developer.android.com/identity/authorization).
