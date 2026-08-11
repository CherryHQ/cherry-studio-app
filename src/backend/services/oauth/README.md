# Provider OAuth

App-managed authorization for AI providers. The public interface is the six-method
`OAuthModule`; callers never select a transport or import a provider definition.

## Desktop Sources

The behavior comes from three desktop owners, not only `src/main/services/oauth`:

- `src/main/services/oauth/runtime` owns long-lived PKCE sessions, token refresh,
  authenticated retry, persistence, and provider enablement.
- `src/main/services/CopilotService.ts` owns GitHub's device-code grant and the
  Copilot serving-token exchange.
- `src/renderer/services/oauth.ts` owns the one-shot PPIO and WebView flows that
  return API keys.

`desktop-sync-map.json` records those sources separately. Expo transports are
mobile extensions; Codex and Grok loopback login remain visible blockers.

## Modules

- `runtime/OAuthRuntimeService` is the semantic port of the desktop session
  runtime. It owns only token exchange, persistence, refresh, logout, and the
  one-time 401 retry.
- `authorization/ProviderOAuthService` owns opaque flow IDs, one active flow per
  provider, timeout, cancellation, completion, and adapter dispatch.
- `authorization/OAuthFlowRegistry` builds the immutable provider-id to adapter
  registry and rejects duplicate registrations.
- `authorization/OAuthApiKeyStore` distinguishes OAuth-minted keys from manual
  keys so logout removes only the former.
- `authorization/adapters` implements PKCE, device-code, authorization-code API
  key, WebView API key, and blocked flow families.
- `authorization/providers` owns each hosted provider's URL, origin allowlist,
  response schema, and decryption behavior.
- `runtime/OAuthTokenStore` serializes async SQLite mutations. Desktop data access
  is synchronous, so this queue is a required mobile adaptation. The queue lives on
  the instance, so the module shares one store: `oauthTokenStore`.
- `providerRepository` binds the four provider-row calls this module makes to
  `providerService`, which desktop's stores reach directly.

Executable provider logic stays in backend. `src/shared/oauth` contains only
DTOs and errors, while the frontend decides whether to render OAuth from the
Provider Registry's `authMethods` field.

## Invariants

- Refresh failures clear a session only for terminal 4xx responses; 408, 425,
  429, network failures, 5xx responses, and parse errors remain retriable.
- Refresh work is keyed by `providerId:refreshToken`, and conditional writes
  prevent stale refreshes from resurrecting logout or overwriting a re-login.
- Tokens persist before post-exchange side effects because an authorization code
  cannot be reused after exchange.
- WebView messages require an exact HTTPS origin, a valid provider schema, and a
  payload no larger than 64 KiB.
- Missing PPIO or AiHubMix build secrets fail closed.
- OAuth logout preserves manually entered API keys.

## Adding A Provider

Add one adapter or provider definition and register it in
`authorization/createOAuthFlowRegistry.ts`. The generic runtime, public contract,
hook, and screens must not learn the provider's name. Add the provider's
`authMethods` entry, adapter contract tests, provenance record, and any optional
account links used by the settings screen.

MCP OAuth is SDK-driven and remains outside this module. Provider account REST
surfaces, such as CherryIN balance and profile, remain in their own backend
module.
