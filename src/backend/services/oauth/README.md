# OAuth Runtime

App-managed OAuth for **AI providers**. This is not a system-wide OAuth layer —
it is provider-scoped by design. Read the boundary section before extending it or
before wiring a new OAuth consumer through it.

It mirrors the desktop runtime at `src/main/services/oauth/runtime/`. Divergences
from that source are noted below and are deliberate; do not "fix" them during a
desktop sync.

## Scope And Boundary

This runtime drives the PKCE authorization-code flow for providers whose
credential the app itself holds and refreshes. It owns the token half of the flow
(exchange → persist → refresh) plus the provider's enablement: a successful
sign-in flips the provider `isEnabled` on, and logout resets `authConfig` to
`api-key`.

The hard coupling is to the provider row in SQLite: tokens persist into that
row's `authConfig` via `ProviderAuthConfigOAuthTokenStore`. A non-provider entity
(an MCP server, a sync account) cannot reuse this runtime without its own
`OAuthTokenStore` implementation and its own enablement model.

Other authorization flows are deliberately **separate** and must not be routed
through here — they are different protocols, and folding them in would produce a
leaky mega-abstraction. The boundary matches desktop's:

| Flow | Why separate |
| --- | --- |
| MCP remote servers | SDK-driven with dynamic client registration; control is inverted. Mobile currently supports only static, user-entered headers (`McpRuntimeService`). |
| GitHub Copilot | Device flow (RFC 8628) — no redirect or callback. |
| Nutstore | Proprietary SSO with custom encryption, not standard OAuth. |
| Feishu / WeChat | Proprietary device and binary protocols, not OAuth. |
| Silicon / PPIO / 302 / AIHubMix | One-shot popup that returns an **API key** — no token session, nothing to refresh. |
| External web search providers | Static API keys read from preferences. |

## Architecture

Provider definitions live in `@/shared/oauth` rather than beside this runtime,
because the frontend needs the client id, scopes, redirect and authorize URL to
build the authorization request. Mobile is one process, so there is no renderer
trust boundary to keep them apart.

The split of responsibilities differs from desktop:

- **Frontend** (`useAuthRequest` from `expo-auth-session`) owns PKCE generation,
  the authorize URL, the browser round-trip, and `state` verification. Desktop's
  `PkceOAuthClient.createAuthorizationRequest`, `LoopbackCallbackTransport` and
  `DeepLinkCallbackTransport` therefore have no counterpart here.
- **`PkceOAuthClient`** owns only the token endpoint. It is hand-rolled rather
  than using `expo-auth-session`'s `exchangeCodeAsync`/`refreshAsync` because
  that library never reads `response.status`; the terminal-versus-retriable
  grading below depends on it.
- **`OAuthRuntimeService`** owns token lifetime: expiry buffer, refresh
  deduplication, failure grading, the 401 retry, and enablement.
- **`OAuthTokenStore`** owns persistence and the compare-and-write guard.

## Invariants Worth Keeping

Each of these exists because of a specific failure, and most are covered by a
test in `runtime/__tests__/`:

- **Refresh failures are graded.** A 4xx from the token endpoint means the
  refresh token is dead (clear the session), *except* 408/425/429. Everything
  else — network errors, 5xx, parse failures — is retriable and must keep the
  session, so a flaky network never logs the user out.
- **Refresh deduplication is keyed by `providerId:refreshToken`**, not by
  provider alone. Keyed by provider, a re-login during an in-flight refresh would
  reuse the superseded session's promise and act on its terminal result, clearing
  the session the user just created.
- **A refresh confirms its write landed.** If the compare-and-write was rejected,
  the store holds a different session's token; handing either one to the in-flight
  request would switch accounts silently, so it fails closed.
- **Tokens persist before `afterPersistTokens` runs.** The authorization code is
  spent by then, so a failing side effect must not discard a valid token.
- **The store serializes its mutations.** This is the one piece with no desktop
  counterpart. Desktop's compare-and-write is atomic because its reads and writes
  are synchronous; mobile's hit SQLite and are not, so without the queue a
  refresh resolving during a logout resurrects the session the user signed out
  of. `OAuthTokenStore.test.ts` fails if the queue is removed.

## Adding A Provider

One file in `@/shared/oauth/providers/<id>.ts`, plus one line in
`definitions.ts`. Nothing in this runtime, the contracts, or the settings UI
needs to learn the provider's name — `isOAuthProvider` drives the UI, and every
contract method is keyed by `providerId`.

The variation points are the definition's fields and hooks: `clientId`,
`redirect`, `scopes`, `clearDisablesProvider`, `resolveEndpoints(context)`,
`extractAccountId(accessToken)`, `afterPersistTokens(tokenData, context)`, and
`revokeToken(accessToken, context)`.

Set `clearDisablesProvider` only when the OAuth session is the provider's *only*
credential. CherryIN omits it because it can also hold a manually entered API
key, which logging out must not disable.

A provider-specific REST surface does not belong here: `CherryInClient` owns CherryIN balance and
profile requests in `src/backend/services/cherryin`, behind `CherryInModule`.
