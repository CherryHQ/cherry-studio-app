# Community Cloud subscriptions

`CloudRuntime` owns community subscription state, device-bound Cloud sessions, the managed model
catalog, and request admission. Bootstrap supplies its account identity source; this module does
not import the enterprise implementation or read Accounts Portal's private storage keys.
`Backend.cloud` exposes only status, subscription data, model metadata and refresh/subscription
methods. Tokens and device secrets never reach the frontend or database.

## Configuration

Set `ACCOUNTS_PORTAL_CLOUD_API` to the HTTPS **origin** of the Cloud API linked to the configured
Accounts Portal deployment. Supply that product's audience in `ACCOUNTS_PORTAL_SCOPES`, alongside
any enterprise audience. No geographic region, price, SKU or model name is hardcoded. Missing or
invalid Cloud configuration leaves ordinary local/provider use available and reports subscription
information as unavailable. This feature has no purchase or renewal entry point.

The pinned Accounts Portal 0.2.0 patch adds `getIdentityTokens()`. It returns a matched access/ID
pair after refresh and checks the SDK's session and profile generations. `AccountRuntime` also
checks its community identity before and after the read. Remove the patch when the upstream SDK
provides this contract; its installed-source regression is
`scripts/__tests__/accountsPortalIdentityTokens.test.ts`.

## Session and transport

`CloudSession` exchanges the IdP pair at `/accounts-portal/v1/enter`, then uses the returned
Product Session and device ID for signed control-plane reads and inference. Product credentials
stay in memory. Access-token expiry rotates the refresh token once; a lost rotation response
clears the cached session so the next attempt enters afresh. HTTP 401 invalidates the cached
product token. Requests are not automatically replayed.

`cloudDevice` stores an Ed25519 seed separately from the device identifier in device-only secure
storage. Android uses `ANDROID_ID`; iOS uses a Keychain UUID. Machine-code HMAC follows the mobile
proposal in Cloud's device-signature protocol (application domain, platform, NUL, normalized ID).
That proposal was marked pending Cloud-owner confirmation in the reviewed server revision;
matching the deployed policy and mobile minimum-version configuration requires integration
verification. Device signatures use the published v2 canonical bytes, raw body hash and a fresh
nonce. Inference includes an idempotency key. Redirects and cookies are disabled.

Control-plane calls use the shared HTTP client. `createModelFetch` is the streaming exception: it
accepts only the configured HTTPS origin and the selected model's exact POST route, checks the
body model, strips caller credentials/control headers, signs the final body bytes, and uses
`expo/fetch`. The account generation remains linked to cancellation until body completion or
cancellation. Both Pi language serving and the AI SDK provider adapter use this boundary.

## Entitlements and model ownership

- `/api/v1/account` is the admission snapshot; `/api/v1/account/plans` supplies display details;
  `/v1/models` supplies the catalog and features.
- An active, currently effective entitlement and an available model feature are required. Every
  window of a quota pool must have credit; any independent pool can admit the model. Reserved
  units are already reflected in the server's remaining units. The gateway owns final admission,
  reservations and charging when requests race.
- Agent conversations use `agent`. One-shot text generation (including translation) uses
  `general`, requiring both `chat` and `translate`. Picker callers can select the same purpose;
  its default is `agent`, and translation model settings request `general`.
- Rolling, calendar-day and paid-subscription-month windows retain their server timestamps.
  Money quotas use 1,000,000 units per currency unit; price amounts use 100 minor units. Recovery
  timestamps describe the earliest partial recovery, not a complete reset.
- `cherryai-subscription` is a reserved, managed provider. The ordinary provider/model mutation
  services reject edits to it. Projection writes no credentials. Revoked models are disabled and
  hidden, keeping their IDs/names for history; user-configured providers and conversations remain.
- State refreshes after sign-in/account replacement, foreground entry, subscription-page opening,
  inference completion/cancellation, and periodically. Admission refreshes a stale snapshot.
  Failures preserve display data but deny new Cloud requests, rather than manufacturing zero usage.
- Account replacement clears the public snapshot synchronously, cancels old requests and discards
  late results. Catalog projection is serialized and generation-checked in its write transaction.
  Unchanged catalogs are not rewritten. Cloud writes participate in backup storage admission.

The source protocol reviewed for this implementation is Cloud API
`5fbef215e3fc1309745fd754d963e5400923dc78`. Unit and database regressions cover quotas, signature
bytes, token pairing/rotation, stale responses, sign-out and catalog retention. They were authored
but not executed in this implementation session; no live Cloud or device acceptance was run.
