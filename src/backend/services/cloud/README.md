# Community Cloud subscriptions

`CloudRuntime` owns community subscription state, device-bound Cloud sessions, the managed model
catalog, and request admission. Bootstrap supplies its account identity source; this module does
not import the enterprise implementation or read Accounts Portal's private storage keys.
`Backend.cloud` exposes only status, subscription data, model metadata and refresh methods.
Tokens and device secrets never reach the frontend or database. Community accounts use their
eligible models through the managed `CherryAI` provider. Confirmed paid subscribers see their plan
and remaining quota in the sidebar badge.

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
product token on ordinary Cloud reads and paid inference. The AMD inference path retries once only
on a gateway replay rejection or a request to rebuild the Cloud session.

`cloudDevice` stores an Ed25519 seed separately from the device identifier in device-only secure
storage. Android uses `ANDROID_ID`; iOS uses a Keychain UUID. Machine-code HMAC follows the mobile
proposal in Cloud's device-signature protocol (application domain, platform, NUL, normalized ID).
That proposal was marked pending Cloud-owner confirmation in the reviewed server revision;
matching the deployed policy and mobile minimum-version configuration requires integration
verification. Device signatures use the published v2 canonical bytes, raw body hash and a fresh
nonce. Each inference request generates a separate 32-byte random idempotency key encoded as
43 unpadded base64url characters; the same value is signed and sent in `Idempotency-Key`.
`Cherry-Request-ID` remains a UUID. Redirects and cookies are disabled.

When `CHERRY_CLOUD_CLIENT_SECRET` is provisioned, inference also sends application HMAC headers
`X-Client-ID`, `X-Timestamp` and `X-Signature`. The canonical text follows the Cloud client helper:
uppercase method, path, empty query, `cherry-studio`, Unix timestamp and the exact request body,
joined with newlines. The native signer uses the unmodified UTF-8 Cloud credential, independently
of the CherryAI diagnostics credential and suffix. `MAIN_VITE_CHERRY_CLOUD_CLIENT_SECRET` is an
accepted build-name fallback. The credential stays out of Expo's public config and JavaScript;
`modules/cloud-signing` owns native signing. For inference this applies only to the validated model routes,
with existing Product Session and device-signature headers retained. Login and account reads are
unchanged. Provisioning requires a new native build; older clients or builds without the optional
credential retain device-only authentication for signed-in inference. Live gateway acceptance of the additional application
headers has not been verified.

Control-plane calls use the shared HTTP client. `createModelFetch` is the streaming exception: it
accepts only the configured HTTPS origin and the selected model's exact POST route, checks the
body model, strips caller credentials/control headers, signs the final body bytes, and uses
`expo/fetch`. The Anthropic SDK's exact `?beta=true` marker is removed before signing and sending
the canonical messages route; other queries remain rejected. The account generation remains linked
to cancellation until body completion or cancellation. Subscription conversations use the existing
`PiDurableAgentRuntime` →
`createPiDurableModels` → `piModelResolver` → `bindPiStream` path. Cloud adds admission, signing and
account-lifetime cancellation at the fetch boundary; Pi owns protocol parsing, retry classification
and durable execution. Streaming responses retain Expo's original response object with a lazy,
replaceable body wrapper so Pi's existing transport adapter can compose over it. React Native's
global `Response` constructor cannot carry a `ReadableStream` and must not reconstruct this response.
Both Pi language serving and the AI SDK provider adapter read this native body, including finite JSON
responses. They use the same boundary without buffering the response or constructing a replacement.

## Entitlements and model ownership

- `/api/v1/account` is the admission and quota snapshot; `/v1/models` supplies the catalog and
  features. Signed-in requests use both. The separate `/api/v1/account/plans` read
  supplies plan membership descriptions and badge metadata after account/model readiness; a slow request, failed response
  or invalid display payload cannot delay or reject inference. Admission revalidation does not
  request this display metadata. Cold start and explicit refresh load it for active accounts, including accounts without a subscription.
- The sidebar badge requires a confirmed, currently effective paid entitlement, independently of
  quota exhaustion or model catalog availability. It hides for free, expired, signed-out and
  enterprise accounts, and keeps a still-effective subscription visible after a temporary read
  failure. Plan metadata for a confirmed entitlement supplies its name. Remaining quotas come from
  matching allocation IDs in the account snapshot. When matching metadata is unavailable, the
  badge uses its generic Cloud label and omits unconfirmed quota associations. The profile exposes
  no purchase or management action. The managed provider opens a read-only model list, without connection
  settings or model mutation actions.
  Community settings and the chat picker show the published catalog, including locked models.
- Ordinary plan models require an effective free or paid entitlement and support for the selected
  use. The gateway enforces quotas on each request. The sidebar displays the most recently
  confirmed remaining units, including the effect of server reservations.
- Agent conversations use `agent`. One-shot text generation (including translation) uses
  `general`, requiring both `chat` and `translate`. Picker callers can select the same purpose;
  its default is `agent`, and translation model settings request `general`.
- Rolling, calendar-day and paid-subscription-month windows retain their server timestamps.
  Money quotas use 1,000,000 units per currency unit. Recovery
  timestamps describe the earliest partial recovery, not a complete reset.
- `cherryai-subscription` is the reserved, managed `CherryAI` provider. Provider queries
  pin it first, including cursor pagination, without changing other providers' saved order keys.
  Settings render their own fixed entry above the saved providers. Ordinary provider/model mutation
  services reject edits to it. Projection writes no credentials. Revoked models are disabled and hidden,
  keeping their IDs/names for history; user-configured providers and conversations remain.
- Cold start checks subscription display once after account restoration. A newly signed-in or
  replaced account loads its own state, while signed-out installations fetch the HMAC model directory
  without querying personal account endpoints. Opening the sidebar triggers a silent refresh. A permanent sidebar checks when it
  becomes visible in the foreground if the snapshot is stale. Concurrent reads share the
  account/model request. A transient background failure preserves the previous confirmed state.
- Sending revalidates stale model access. Inference completion or cancellation marks the sidebar
  quota stale, including if an earlier read is still in progress. The gateway decides whether
  quota permits the request.
- Account or service-address replacement clears the public snapshot synchronously, cancels old
  requests and discards late results. Revocation uses the old session's service; the replacement's
  queries and inference use the new one. Catalog withdrawal disables old rows without
  writing a fabricated empty service address. Projection is serialized and generation-checked in its
  write transaction. Only catalog writes count as storage work. They wait for a backup or restore
  to release the write gate.

## Signed model discovery and guest inference

The model directory is `/v1/models` for both identities. On a CN guest install, Config Service
resolves the Cloud origin without creating a login registration. The client signs the zero-byte
`GET /v1/models?limit=1000` with the native HMAC credential, including the exact raw query
`limit=1000`. Guest inference signs the final POST body with the same application credential.
Guest transport omits cookies, Product Bearer and device headers. The gateway rate-limits requests
by IP; Mobile honors its `Retry-After`. Missing signatures stop both guest transports.

All published rows come from the current identity's directory, including locked models. An explicit
`requires_login=false` permits anonymous inference for an eligible non-AMD model. Missing flags
never grant guest access. Login replaces the guest snapshot and transport lifetime. Member requests
fetch the directory using a Product Session and v2 device signature with a fresh nonce. Account and
plan reads provide personal entitlements, quota and plan descriptions. Signed-in standalone models
need no subscription. Only models admitted by the current identity and model rules enter the local
managed provider; locked offers remain available to browse in memory. Invalid Product credentials
do not fall back to a guest request.

## AMD free models

The community provider accepts AMD rows from the account's `/v1/models` catalog when the supplier
is `amd` and the model uses the OpenAI chat-completions endpoint. The catalog's
`activation_required` flag decides model admission without a paid entitlement or Cherry quota.
Only admitted models are projected for selection. The detail page and conversation picker also
display offered models that still require activation. The gateway applies AMD limits and owns the
AMD key.

The AMD status read at `/api/v1/amd/desktop/status` determines the action offered when the user
presses a model row. A temporary error leaves the row retryable. The registration flag comes from
the current server status. Changes saved in the Cloud admin take effect on the next read.
On confirmation, the same Product Session signs a zero-byte POST to that model’s same-origin `activation_endpoint`. The app
opens the service-provided HTTPS URL in the system browser with its fragment intact. Linked users
can access the same page to view usage. The app takes its full model list from `/v1/models`, and
AMD usage stays on the web. The one-use URL is valid for 60 seconds. Each attempt requests a new URL.

The AMD web page can return to mobile with `cherrystudio://navigate/settings/provider`. The native
intent handler opens chat using the installed app scheme. Development and preview use their existing
`cherrystudio-dev` and `cherrystudio-preview` schemes. A warm return keeps a visible chat mounted.
The app shell refreshes status and models after browser return, so the picker can show newly
available AMD models in the CherryAI group.

AMD inference uses the existing streaming path and retries a gateway replay rejection with a fresh
signature and the same idempotency key. It respects `Retry-After` and refreshes status or catalog on
activation, credential, or availability errors. Pi treats the remaining gateway failures as terminal.
AMD failures leave the Cherry login in place. A credential rejection prompts the user to check AMD
status. The detail page offers re-verification when the server confirms it is needed.
Test and production gateways can serve models in their own `CLOUD_API_AMD_MODELS` allowlists.
Live usage and both response modes require a deployed environment and an activated account.

Mobile follows the [Cloud model and AMD client protocol](https://github.com/CherryInternal/cherry-studio-cloud-api/blob/de4a4092cea9058ace7688871dda70b0fb9d9a4b/docs/amd-mobile-integration.md).
