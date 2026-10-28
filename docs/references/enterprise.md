# Enterprise Edition

Cloud users sign in with Accounts Portal; private deployments use their own username and password
through `/auth/login`. A community account keeps the installation's local data. An enterprise
account, on the cloud service or a private deployment, opens its own data and receives
model providers, models, default models, Agents, Skills and MCP servers from its organization's
enterprise server.

## Module Responsibilities

All modules run in the same mobile JavaScript runtime. Frontend workflows use `Backend`, resource
queries and mutations use the Data API, and preferences use `PreferenceClient`. Bootstrap composes
their implementations. Enterprise accounts use the same chat, model, MCP and Skill services as
local data; enterprise synchronization supplies configuration, not cloud conversation storage.

| Owner | Responsibility |
| --- | --- |
| `AccountRuntime` | Authenticate the current identity and supply credentials matching its profile |
| `ProfileRegistry` | Map stable identities to data directories and select the next startup profile |
| `enterpriseConfiguration` | Validate server responses and distinguish delivered identities from Mobile-supported projections |
| `EnterpriseSyncService` | Schedule and settle configuration updates within the app storage lifetime |
| `projectConfiguration` | Apply organization-owned resources through the synchronization transaction |
| Shared data services | Enforce user mutation rules at each resource's write boundary |

User mutations and organization synchronization have different write authority. Sync uses its own
transaction because ordinary user writes must reject organization-owned fields. Both paths still
obey profile scope, storage admission, transaction consistency and shutdown. Shared schemas,
guards, backup and bootstrap are therefore part of the enterprise contract even outside the
enterprise implementation directory.

## Data Profiles

Each enterprise identity owns a separate data profile; local data is the `local` profile, shared by
community accounts and use without an account. An identity is the enterprise server id
(`serverUniqueId`), the IdP issuer and subject, and the Accounts Portal organization profile id.
A private password identity consists of the server id, user id and password authentication kind,
so it never shares a profile with a cloud identity. Existing cloud identities keep their shape.
Tokens, roles and display names are not part of it. The registry also records the address each
enterprise profile was last reached at, so a moved server keeps its data.

| Owner | Location |
| --- | --- |
| Installation directory of profiles (`ProfileRegistry`) | MMKV `cherry-installation-profiles` |
| Accounts Portal session and the sign-in prompt flag | SecureStore `accounts-portal.*`, MMKV `cherry-installation-account` |
| Private access and refresh tokens (never the password) | SecureStore `profile.<id>.private-account` |
| Local profile | Original Documents, SQLite, MMKV and SecureStore names |
| Enterprise profile | `Documents/profiles/<id>/`; MMKV stores and SecureStore keys prefixed `profile.<id>.` |

The entry point (`index.ts`) selects the active profile before any store opens
(`src/bootstrap/profile/installationProfiles.ts`). `src/shared/data/activeProfile.ts` exposes it for
the rest of the runtime. Sign-in, account switching and sign-out write the next profile to the
registry and reload JavaScript with `reloadAppAsync`. Nothing swaps stores
in place. Backup generations stay inside a profile root; credentials and stores are scoped by
profile only, never by generation, so a restore keeps them.

Before opening a different profile, startup clears disposable content caches (PDF text, image
previews, MCP catalogs, remote attachments, export/staging files and picker copies). A persisted
cache-owner marker preserves caches for ordinary restarts of the same profile. Missing ownership
also clears legacy caches; cleanup failure leaves the old marker and stops startup before readers
open, so a retry cannot silently reuse another profile's cached content. Documents, databases and
the installation's diagnostic log history are retained. Unreadable profile registries are preserved
and refuse writes until a retry can read the original identity mapping.

Native MCP OAuth and built-in plugin credentials also use profile-scoped keys. Local keys retain
their released names. Importing data never grants access to another profile's device credentials;
restore replaces authorization references before the imported database opens.

## Account

`AccountRuntime` (`src/backend/services/enterprise/account`, exposed as `Backend.account`) owns the
installation's single Accounts Portal SDK instance, composed natively in
`src/bootstrap/profile/installationAccount.ts`. The SDK owns PKCE, token storage and refresh.
The runtime also owns private credentials; `privateAccountApi` validates the v2 password exchange
over the shared HTTP transport. Private sign-in works without Accounts Portal build configuration.
`isCloudSignInAvailable` controls the cloud login choice only. The profile's account section and
first-use sign-in remain available for private deployments when Portal configuration is absent.

The account UI offers only sign-in, account switching and sign-out; users never choose a data
profile. The settings page's profile header is the entry: it shows a sign-in button, the signed-in
community account, the organization name or the private server host, and opens the profile page,
which holds the account rows, switching and sign-out. Signing out of an organization asks for
confirmation; a community sign-out does not. A community account uses the installation's own data whether or not it is signed in;
signing in adds only the account identity, and its entitlements are not designed yet. An
enterprise or private account's data is visible only while that account is signed in. In the local
profile, only a community session counts as signed in.

- **Sign-in page:** `LoginScreen` (`src/frontend/appShell/account`) serves first use, sign-in and
  switching from the profile, and an expired session. Cloud sign-in opens the portal in the external
  browser, where the user picks the community account or an organization. A private deployment
  enters its server address, username and password on the same page and signs in directly; an
  expired private session keeps its server and user and asks only for the password.
- **Organization name:** cloud enterprise sign-in reads the organization's display name from the
  portal's profile list and records it in the registry; failing to read it never blocks sign-in.
- **New installation:** `FirstUseGate` shows `/login` before onboarding. Signing in to the community
  account or choosing "Not now" continues to the existing provider setup; an enterprise account
  reloads into its profile and skips onboarding. Installations with data never see the page; they
  sign in from Settings → Account.
- **Enterprise sign-in:** reads `/configurations` once with the product token to learn the server
  id, resolves the profile and reloads into it.
- **Cold start:** enterprise UI waits until stored credentials match the last profile, without
  requiring the network. Missing, mismatched or unreadable private credentials keep the sign-in
  gate closed. Private sessions then validate `/users/me` and `/configurations` against the stored
  user and server ids; an offline start with matching local credentials keeps its data available.
- **Cloud identity changes:** the account gate waits for stored cloud credentials to finish
  restoring before showing enterprise data. Session notifications and product-token reads compare
  issuer, subject, product and organization against the active profile; token reads check again
  after awaiting the SDK. Browser completion fences the old cloud profile before the SDK can replace
  its credentials. A failed switch remains behind sign-in until a profile reload; dismissing the
  browser leaves the current session usable. Private sessions are independent of cloud notifications.
  Reauthentication of the same cloud identity preserves an already admitted session only on a
  network error or timeout. A refusal, invalid admission response or previously rejected session
  never reopens its data through this offline fallback.
- **Session refusal:** the enterprise API client (`enterpriseApi.ts`) attaches the product token and
  its HTTP error interceptor decides whether the server refused the session. Only a 401, or a 403 on
  `/configurations`, refuses it. A 403 on any other path denies one resource, such as an Agent setup
  or Skill package the user's role cannot read, and stays that request's failure. Callers such as
  the sync never interpret authentication errors.
- **Private refresh:** on a 401 the interceptor rotates credentials through `/auth/refresh` and the
  client replays the request once. Concurrent rejections share one rotation. Refresh cannot change
  the user or server identity. Sign-out waits for pending rotation and deletes that profile's
  credentials; cloud sessions remain independent.
- **Expiry:** a refused session, an Accounts Portal `signed_out`, or a session that no longer
  matches replaces the app with the expired sign-in page (`AccountSessionGate`). Data stays on the
  device; the page offers sign-in again or sign-out.
- **Credential admission:** in an enterprise profile, resolving a provider key waits for the stored
  session to be restored and refuses a closed one (`AccountRuntime.admit`, injected into
  `managedResources.ts` by bootstrap), so no model request can start without a session. When the
  session is refused, bootstrap interrupts the Agent Host as background expiry does; interrupted
  turns reopen with the host and fail admission until the user signs in again.
- **Switching:** a cloud organization switches directly through the portal; community and private
  accounts open the sign-in method page first. A browser sign-in forces the portal's login page
  whenever the installation already holds a cloud session, has a refused session, or could not end
  the portal session at sign-out, so a remembered browser sign-in never returns silently. Until
  the portal can reuse a session and still show its profile choice, switching asks for the
  sign-in again. Choosing the open identity again keeps the app in place without reloading.
- **Sign-out:** a cloud sign-out revokes the refresh token and ends the portal's browser sign-in;
  local tokens, profile choice and product tokens are forgotten even when the server is
  unreachable, which marks the browser session stale for the next sign-in. A private sign-out
  deletes that deployment's credentials; the deployment has no revocation endpoint yet. An
  enterprise or private sign-out keeps the profile's data on the device and returns to the
  community data. Signing in again to the same identity, matched by server, issuer, subject and
  organization (or server, user and password sign-in), reopens that data.
- **Failed entry:** when a cloud sign-in cannot enter a different organization, the session just
  received is signed out instead of lingering; the open organization signing in again keeps its
  session.

Build inputs live in `app.config.ts` under `extra.accountsPortal` (`ACCOUNTS_PORTAL_*`). Non-production
builds default to the cn-dev staging deployment. Production has no default. Every build uses the
production callback `cherrystudio://auth/callback`, the only one registered with the Accounts
Portal client. iOS auth sessions capture it in any build; on Android only the production app
receives it, so development and preview builds may not return from the browser.

## Synchronization

`EnterpriseSyncService` runs only in enterprise profiles:

- **Triggers:** after startup, every `sync_interval` minutes (server setting, default 10), and on
  return to the foreground when the last attempt is at least five minutes old.
- **First launch:** only the first launch of a profile waits, and only for resources. Skill packages
  download in the background attempt that follows startup, after Skill storage reconciliation.
  Later launches use what the database already holds.
- **Success:** a sync reads `/configurations` and every Agent's `/agents/:id/setup`. Resources,
  default-model preferences and the applied sync state commit in one transaction. Skill packages
  whose server revision changed then download and bind in a second commit. Preference caches and
  resource observers update after each commit; failed MCP connection invalidations are retried even
  when the next snapshot is unchanged.
- **Failure:** a configuration fetch failure, an invalid configuration inventory or a database
  failure leaves the previous resource configuration in place. An Agent whose setup cannot be read
  or parsed stays as installed, with its bindings and the MCP servers and Skills it binds; the rest
  of the snapshot still applies. A failed Skill download, including a 403, keeps that Skill's
  installed revision and retries on a later sync. Immutable Skill files published before a
  rolled-back transaction can remain unreferenced. Background failures are logged; no sync state is
  shown to the user.
- **Storage lifetime:** admitted sync work participates in backup busy checks and observes the
  storage freeze before publication and transaction writes. Shutdown aborts network work and joins
  the admitted attempt before its database dependencies close, including a first sync started
  before the background service phase.

Original remote identity lists determine removal. An identifiable but unsupported resource keeps
its previously installed row; it is not treated as server deletion. An unsupported Agent retains
its definition and history, while bindings absent from its validated setup are removed even when
other Agents still receive those resources. An invalid configuration identity inventory rejects the
snapshot. Unsupported items are logged: unknown provider types,
endpoints or capabilities, non-HTTP MCP transports, and Agents without a usable model. An Agent keeps its first
usable model; plan/small models and turn limits are ignored. Any permission mode other than bypass
maps to the default ask-first approval mode. Skills are installed whether or not Mobile can run
them.

## Ownership

Core tables gain one nullable column, `managed_remote_id`, on `agent`, `mcp_server` and
`agent_global_skill`. A non-null value is the server id of a delivered resource. Providers and
models need no marker: enterprise profiles skip preset provider seeding, users cannot create
providers, and every provider comes from the server.

| Resource | Server removal |
| --- | --- |
| Provider, model | Deleted |
| MCP server | Deleted with its Agent bindings |
| Skill | Deleted with its bindings |
| Agent | Detached: `managed_remote_id` and instructions are cleared, Skill and MCP bindings removed, conversations kept; it becomes an ordinary user Agent |

The gateway key from `/configurations` is stored on each enterprise provider like any API key.
Default models are written to the ordinary preference keys.
The three organization-owned default-model keys are declared in the shared preference schema;
ordinary preference writes cannot change them in enterprise profiles.

## Read-Only Rules

Services enforce the rules (`src/backend/data/services/managedResources.ts`). The enterprise sync
writes through its own transaction:

- In an enterprise profile, every provider and model mutation is rejected.
- A managed Agent accepts only `MANAGED_AGENT_EDITABLE_FIELDS` (model, mode, tool approval mode,
  capability toggles). Its other fields, Skill and tool bindings, avatar and deletion are rejected.
- Managed MCP servers and Skills cannot be updated, deleted or uninstalled.

OAuth save/disconnect and provider-account key replacement enforce the same rules as ordinary
resource edits. Agent updates compare and authorize submitted fields inside their write transaction,
so a stale full form cannot overwrite a concurrently changed organization-owned field.
The Agent management tools refuse to read or change a managed Agent at all, including its
user-adjustable fields; `agent_list` marks it `isManaged`.

The UI hides provider creation and configuration, shows default models read-only, marks delivered
resources with `ManagedBadge`, and never shows a managed Agent's instructions or a managed MCP
server's headers. Users may still create their own Agents, MCP servers and Skills.

## Backup

An export keeps organization-delivered resources and their `managed_remote_id` markers, together
with the providers and sync state. The database copy records the enterprise identity it came from
(`app_state` key `backup.profile`), and only that identity can restore it; any other profile refuses
the archive before confirmation. Restoring into the same identity keeps every marker, and the next
background sync updates the configuration. Local data restores into any profile; restoring it into
an enterprise profile deletes its providers and clears the sync state, so that launch syncs first.
Restored remote OAuth MCP connections retain their client configuration but receive fresh,
unresolved authorization references and are disabled until the user authorizes them again.

## Code Placement

Enterprise implementation lives in `src/backend/services/enterprise`. Only bootstrap and
`serviceRegistry.ts` import it (ESLint `enterpriseIsolation`). Shared rules live with their owners:
the column in the core schemas, guards in data services, `ManagedBadge` in `src/frontend/components`.
`CODEOWNERS` names the enterprise implementation and the installation profile bootstrap.
Enterprise import allow/deny cases live in `scripts/__tests__/architectureBoundaries.test.ts`;
resource and account regressions stay with their owning services.
