# Built-In MCP Roadmap

> Status (2026-09-10): future work, except for the implemented decisions below. The current code
> is described in [Built-In MCP Integrations](./built-in-mcp-design.md). Updated regression suites
> have not been executed in this session; device and live-account acceptance remain outstanding.

## Implemented Decisions

1. **Multiple authorization methods per definition.** `PluginDefinition.authMethods` owns each
   method's field rules or interactive runtime factory and request authorization. The runtime
   manager and connection page select methods from that registry. GitHub supports OAuth App
   authorization alongside personal-token entry; Feishu supports device authorization. Amap
   continues to use a Web Service key.
2. **Local native credentials, without sync.** SecureStore owns applications and completed grants;
   SQLite owns connection metadata and references. Pending authorization lives only in memory.
   Failures require the user to repeat the flow; no legacy credential compatibility is provided.
3. **Caller-independent renewal.** Callers share one renewal result. Cancelling a tool call stops
   only its wait. The complete native token bundle is replaced while the grant identity still matches.
4. **GitHub callback authorization and local status.** A system authentication session returns to
   the method runtime for PKCE validation and account confirmation. Local credential status,
   token renewal, same-account reconnection and best-effort remote revocation are implemented.
   Live-account and device acceptance remain pending.

## Persistence

### Authorization Table

The current `plugin_authorization` table stores plugin ID, auth method, account label, secret reference
and timestamps. The target for later OAuth and multi-account slices adds:

| Field | Shape and responsibility |
| --- | --- |
| `accountId`, `tenantId` | Remote account identity and optional workspace/tenant identity; a Feishu user may have multiple tenant grants |
| `status` | `connected`, `needs_reauth`, or `disconnected`; not a live network-health indicator |
| `authorizationVersion` | Monotonic grant identity version; changes on reconnect, revocation, account/permission changes or disconnect |

Use indexes on `pluginId` and `(pluginId, accountId, tenantId)` for lookup. Do not globally
deduplicate on account name or account ID: two personal tokens can intentionally grant different
repository or workspace access. Reconnection targets an explicit authorization ID and validates the
returned account and tenant. A different account creates a new authorization and server instance,
which requires replacing the single-connection-per-plugin index with a partial unique index on
`(builtinId, authorizationId)`.

Interactive attempts are short-lived authorization sessions; abandoned browser flows do not create
connected rows. A `connected` row must have a validated credential object.
Disabled tool names, Agent IDs, approval preferences, and tool schemas do not belong in this table.

### Credential Storage And Atomic Renewal

The current implementation stores an opaque native-secret reference in the authorization row.
Keep provider-specific tokens, returned scopes and expiration metadata inside the native object.
The manager-owned storage queue checks the grant ID before replacing its native item; introduce a separate revision only if later concurrency requirements justify it. Future
methods should reuse this adapter rather than create a per-feature secret store.

Future methods own validated variants for personal tokens, API keys, OAuth token bundles and client
registration data, or native SDK account references. Do not manufacture a missing refresh token or
an expiry for a non-expiring credential. A native SDK reference still needs an explicit unavailable
account state after a restore.

Disconnect first commits `disconnected`, clears the credential object, and advances the grant
version; invalidate/abort the affected MCP generations before the workflow returns. Keep a bounded
in-memory revocation capability before clearing storage and perform best-effort upstream revocation
when supported. Recheck grant state when an in-flight refresh finishes so it cannot recreate a
disconnected grant.

Grant secrets do not travel with the database and do not participate in sync. A database restored
without its native items or an unavailable SDK account requires reconnecting.
Ordinary export does not include grants. Do not promise continuous execution while the OS suspends
the application.

### Connection Identity

Generalize the URL-only descriptor identity into a discriminated connection identity so the Host
can freeze it with the tool schema and callback:

```ts
type McpConnectionIdentity =
  | { origin: 'remote'; endpointUrl: string; generation: number }
  | {
      origin: 'builtin';
      builtinId: BuiltInMcpId;
      authorizationId: string;
      authorizationVersion: number;
      catalogVersion: number;
      generation: number;
    };
```

Do not invent a fake URL for a local server or use display names as lookup keys.

## Authorization Runtime

The existing `PluginAuthorizationManager` belongs to the ApplicationHost generation and owns one
`PluginAuthorizationRuntime` per interactive method. Each method receives a scoped native-storage
adapter backed by SQLite references. Disposal stops observers, drains work and drops in-memory
credentials. Startup does not prompt for login or renew credentials before first paint.

GitHub callback authorization is implemented in the [integration reference](./built-in-mcp-design.md#github-browser-authorization). Further callback and native SDK methods should preserve the existing request sequence:

1. Resolve the current grant and validate the method-specific credential and permissions.
2. Obtain or renew credentials with a small expiry allowance; personal tokens/keys are used as supplied.
3. Share one pending renewal per authorization, separating caller cancellation from its owner.
4. Commit the returned object only if the expected grant and credential still match. Preserve an
   existing refresh token when the provider legitimately omits a replacement.
5. Recheck authorization and dispatch the platform request with the caller's signal and deadline.

GitHub's current local status projection maps missing or confirmed rejected credentials to
`needs-reauthorization`; network failures, quota errors and ordinary forbidden-resource responses
retain their own reasons. Future methods should preserve this distinction. A successful remote
refresh followed by local persistence failure may require reconnecting: a database transaction cannot make the
upstream token rotation atomic. Do not blindly retry a single-use refresh token after an ambiguous
network outcome unless that provider documents a safe recovery window.

Browser authorization for providers with callbacks uses the system authentication session with a
matched callback, state and PKCE where supported. The interactive session owns and clears temporary
verifier/state data. Model tool execution never opens a login browser itself: it returns a
reconnect action for the user.

## HTTP Infrastructure Reuse

All ordinary API requests use `createHttpClient()` from `backend/services/http`. Create routes for
each distinct authority, for example GitHub API versus GitHub login, and Google token versus Gmail
API endpoints. The single shared Axios transport remains the transport engine.

- A platform client owns its endpoint paths, schemas, pagination and conversion from platform errors
  to domain errors. Local tool handlers own user-intent operations, not raw arbitrary HTTP calls.
- Inject current authorization per request using an account-scoped callback or interceptor. Never
  place a token in shared Axios defaults, capture a token permanently when creating a client, or
  let tool parameters provide a base URL, credential, authorization ID or headers.
- User/tenant-specific hosts, such as a Yuque space, are validated and frozen at connection time by
  that integration's adapter. Responses and redirects cannot silently change the credential's
  authority.
- OAuth form requests use an explicitly encoded body and content type through the existing body
  contract. JSON and bounded text responses already fit the contract.
- The HTTP module does not own refresh or automatic retry. Refresh belongs to the authorization
  runtime; an operation's client decides whether any repeat is safe. Interceptors do not replay
  requests. The initial policy permits at most one safe read retry within the call deadline and
  honors a provider retry delay only when it fits that deadline.
- Create/send/update operations have no automatic transport replay. A timeout after submission is
  reported as an unknown outcome with any available operation/resource identifier. Use a documented
  provider idempotency key where available; do not claim exactly-once execution for Gmail send or
  GitHub issue creation. A new model call is not inherently the same operation.
- Keep query serialization, cancellation, positive timeouts, size bounds and safe `HttpError`
  mapping at the existing transport boundary. Amap coordinates explicitly identify their coordinate
  system and are converted before using APIs that require a different system.

Remote MCP traffic uses the existing specialized `expo/fetch` MCP transport; Streamable HTTP must
not be forced through the non-streaming HTTP client. For future OAuth connections, use the SDK's
`auth()` helper and `OAuthClientProvider` for the explicit connection session, with an HTTP-backed
fetch adapter for ordinary OAuth metadata/form requests. Retain the returned registration/issuer
facts for the authorization runtime's renewal. Do not attach a second refresh owner to the active
transport: keep `maxRetries: 0` and leave transport-level `authProvider` unset so refresh
concurrency and write replay stay under Cherry's operation policy.

Before supporting uploaded files or exported binaries, extend the owning file/transport boundary
with managed-file inputs, bounded streaming downloads and content validation. The present HTTP
response contract is JSON/text; it is not already a generic binary or streaming transfer API.

## Direct-API Integrations

For local integrations such as Yuque, extend the existing MCP client with an in-process transport
backed by a bundled tool dispatcher. Preserve JSON-RPC messages, request correlation,
initialization/version negotiation, `tools/list`, `tools/call`, ping, cancellation and close
semantics. Advertise only implemented capabilities; unknown methods and invalid parameters receive
protocol errors. Keep the protocol version within the installed client's supported set. MCP
explicitly permits custom transports with its message and lifecycle requirements preserved.
[Transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)

The bridge implements the installed `MCPTransport` interface; it does not create a second client
library, listen on a port, launch a subprocess, or execute downloaded code. Its dispatcher accepts
only names in the bundled catalog and validates inputs again at the execution boundary. A local
session is bound to one server instance and one authorization, never a mutable global account.

A local tool definition has a stable raw name, description, validated input/output schemas,
required permissions, operation classification and handler. Use one schema source to validate
inputs and generate the MCP JSON Schema. Handlers close over their instance's platform client and
grant; they do not import SQLite, React, the model Runtime, or sibling platform implementations.

Permission resolution is adapter-specific. OAuth adapters can filter on returned scopes; API-key
and personal-token adapters use their validated connection/capability facts instead of requiring
fictional OAuth scopes. If resource-level access cannot be known in advance, let the official API
enforce it and return a precise denial.

Each tool performs a useful bounded operation. Do not expose `request(url, method, body)`, giant
action enums, or a tool for each HTTP endpoint. Keep platform-native pagination inside its client.
Public results report `nextCursor` and `truncated` when applicable, and never silently treat a
partial list as complete. Bound text fields before the existing 256 KiB MCP projection limit.
Preserve actionable failures such as `authorization_required`, `insufficient_scope`,
`rate_limited`, `resource_not_found`, and `outcome_unknown` inside validated MCP error content.
Protocol failures and failed tool operations remain distinct.

Version 1 returns JSON/text, remote IDs and URLs with `artifacts: []` through the existing MCP
adapter. It does not promise that a Canva export URL is a local attachment. A later explicit Cherry
importer may download approved bytes, create managed entries and grant them through the Host's
resource ledger. No local or remote MCP JSON is promoted into a file grant by shape-matching it to
`{ value, artifacts }`.

## Plugin Instruction Resources

Bundled instruction resources are implemented for GitHub, Amap and Feishu through the existing
plugin registry. The [module contract](../../../src/backend/services/builtInMcp/README.md#plugin-guides)
defines the TypeScript guide data, source/revision attribution, authoring validation and
size limits. The Host prepares only guide sections whose required tools are executable for this
Agent and connection, without changing saved prompts, chat history or MCP permissions. Configuration
changes apply to the next turn and execution-time revocation remains immediate. Plugin details
provide a read-only full-guide preview.

General Skill management, imports, on-demand loading of longer guides and task shortcuts remain
future work. Visual workflow editing, background scheduling, executable extensions, and a third-party
plugin marketplace are outside the bundled instruction slice.
