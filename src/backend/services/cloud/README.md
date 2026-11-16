# Community Cloud subscriptions

`CloudRuntime` owns community subscription state, device-bound Cloud sessions, the managed model
catalog, and request admission. Bootstrap supplies its account identity source; this module does
not import the enterprise implementation or read Accounts Portal's private storage keys.
`Backend.cloud` exposes only status, subscription data, model metadata and refresh methods.
Tokens and device secrets never reach the frontend or database. Confirmed community subscribers
see their plan and remaining quota in the sidebar badge and use their models through a managed
`CherryAI` provider.

## Configuration

The account identity source supplies the current session's concrete `apiOrigin`.
`CloudRuntime` requires a validated API origin before account reads, model synchronization or
inference. Unused management-page metadata does not participate in authentication or admission.
It does not read a regional address map or select a service from a region marker. A missing API
origin or invalid supplied address makes Cloud unavailable without changing ordinary provider use
or reusing the previous session's service. API origins must be HTTPS and cannot contain a path,
query, fragment or credentials.

The installation account adapter gets `endpoints.cloud_api_origin`
from the selected region's Config Service `POST /v1/resolve` response and persists the registration
in SecureStore. A community-only region can omit both enterprise endpoints. When product metadata is missing
or a Cloud read failed, its backend-only metadata refresh resolves the saved login region and issuer
before that read. It has no timer. Healthy configured reads go directly to Cloud without waiting
for discovery. It retains the SDK, authentication binding and enterprise routing. Missing product
metadata can recover when the server starts supplying it, without another login; a discovery
outage keeps already configured product addresses usable. An address change enters the same
identity-replacement boundary as an account change.

Supply the Cloud product audience in the region's Config Service registration scopes.
Models and subscription state come from the service. The app exposes no subscription-management
or purchase action. Plan details are display-only and never determine request admission.
Subscription model availability is checked once when the community account is restored on a cold
start. It does not depend on a purchase entry or browser-return trigger. Only confirmed service
entitlements determine subscription status.

Accounts Portal 0.2.1 provides `getIdentityTokens()` without a local patch. It returns a matched
access/ID pair after refresh and checks the SDK's session, profile and sign-in generations.
`AccountRuntime` also checks its community identity before and after the read. Its installed-SDK
regressions for matched token refresh and sign-out isolation remain in
`scripts/__tests__/accountsPortalIdentityTokens.test.ts`.

The account layer owns the actual issuer, matched identity tokens and service addresses, as described
in [Enterprise Edition](../../../../docs/references/enterprise.md#account). SDK fields and values
are translated at the installation's account integration point. Account and address changes update
the identity source atomically, including when the subject and product profile stay the same.

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
nonce. Each inference request generates a separate 32-byte random idempotency key encoded as
43 unpadded base64url characters; the same value is signed and sent in `Idempotency-Key`.
`Cherry-Request-ID` remains a UUID. Redirects and cookies are disabled.

Control-plane calls use the shared HTTP client. `createModelFetch` is the streaming exception: it
accepts only the configured HTTPS origin and the selected model's exact POST route, checks the
body model, strips caller credentials/control headers, signs the final body bytes, and uses
`expo/fetch`. The account generation remains linked to cancellation until body completion or
cancellation. Both Pi language serving and the AI SDK provider adapter use this boundary.

## Entitlements and model ownership

- `/api/v1/account` is the admission and quota snapshot; `/v1/models` supplies the catalog and
  features. Both are required for model admission. The separate `/api/v1/account/plans` read
  supplies optional badge metadata after account/model readiness; a slow request, failed response
  or invalid display payload cannot delay or reject inference. Admission revalidation does not
  request this display metadata. Cold start and explicit refresh load it only for paid subscribers.
- The sidebar badge requires a confirmed, currently effective paid entitlement, independently of
  quota exhaustion or model catalog availability. It hides for free, expired, signed-out,
  unavailable and enterprise accounts. Plan metadata supplies its name; remaining quotas come from
  matching allocation IDs in the account snapshot. When metadata is unavailable, the badge uses
  its generic Cloud label and omits unconfirmed quota associations. The profile exposes no purchase
  or management action. The managed provider opens a read-only model list, without connection
  settings or model mutation actions.
  Accounts without any currently entitled Plan models do not see the provider in settings or
  the picker.
- An active, currently effective paid entitlement and an available model feature are required. Free
  entitlements alone do not expose Plan models. Every window of a quota pool must have credit;
  any independent pool can admit the model. Reserved
  units are already reflected in the server's remaining units. The gateway owns final admission,
  reservations and charging when requests race.
- Agent conversations use `agent`. One-shot text generation (including translation) uses
  `general`, requiring both `chat` and `translate`. Picker callers can select the same purpose;
  its default is `agent`, and translation model settings request `general`.
- Rolling, calendar-day and paid-subscription-month windows retain their server timestamps.
  Money quotas use 1,000,000 units per currency unit. Recovery
  timestamps describe the earliest partial recovery, not a complete reset.
- `cherryai-subscription` is the reserved, managed `CherryAI` provider. Provider queries
  pin it first, including cursor pagination, so settings and model pickers share the same priority
  without changing other providers' saved order keys. Ordinary provider/model mutation services
  reject edits to it. Projection writes no credentials. Revoked models are disabled and hidden,
  keeping their IDs/names for history; user-configured providers and conversations remain.
- Cold start checks subscription display once after account restoration. Repeated notifications
  for that identity do not issue another read. A newly signed-in/replaced account loads its own
  state, while signed-out installations make no subscription requests. Foreground transitions,
  elapsed time and inference completion do not trigger another display check; there is no polling
  or automatic retry. A failed cold-start check remains an error until an explicit retry or the
  next start. The automatic read is silent and does not set the explicit-refresh flag.
  Model admission still revalidates a stale snapshot before sending. Completion/cancellation only
  marks it stale for the next request, preserving quota checks without an idle background read.
  Failures preserve display data but deny new Cloud requests, rather than manufacturing zero usage.
- Account or service-address replacement clears the public snapshot synchronously, cancels old
  requests and discards late results. Revocation uses the old session's service; the replacement's
  queries and inference use the new one. Catalog withdrawal disables old rows without
  writing a fabricated empty service address. Projection is serialized and generation-checked in its write transaction.
  Unchanged catalogs are not rewritten. Cloud writes participate in backup storage admission.

The source protocol reviewed for this implementation is Cloud API
`5fbef215e3fc1309745fd754d963e5400923dc78`. Unit and database regressions cover quotas, signature
bytes, token pairing/rotation, stale responses, sign-out and catalog retention. They were authored
but not executed in this implementation session; no live Cloud or device acceptance was run.
