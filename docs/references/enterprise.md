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
the installation's diagnostic log history are retained. Only an absent profile registry selects
local data. An unreadable registry or an unknown active profile throws at the entry point before
Router and profile-owned stores load; only our own code writes the registry, so this is a defect to
fix, not a state to recover from.

Native MCP OAuth and built-in plugin credentials also use profile-scoped keys. Local keys retain
their released names. Importing data never grants access to another profile's device credentials;
restore replaces authorization references before the imported database opens.

## Account

`AccountRuntime` (`src/backend/services/enterprise/account`, exposed as `Backend.account`) owns the
installation's single Accounts Portal SDK instance, composed natively in
`src/bootstrap/profile/installationAccount.ts`. The SDK owns PKCE, token storage, identity claims, refresh and candidate-session admission.
The runtime also owns private credentials; `privateAccountApi` validates the v2 password exchange
over the shared HTTP transport. Private sign-in works without Accounts Portal build configuration.
Missing Portal configuration does not change the sign-in method page. Requesting cloud sign-in
reports the configuration error, whose invalid field names are recorded in diagnostics. Community
sign-in does not require an enterprise service address; only enterprise admission validates it.

The account UI offers sign-in, organization switching, account switching and sign-out. The
portal lists the community account and organizations to switch between; the app selects a local data profile only after admission succeeds. The settings page's profile header is the entry: it shows a sign-in button, the signed-in
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
  expired private session keeps its server and the server-returned username when known. A missing
  username remains editable; display names and user IDs never become login names.
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
  after awaiting the SDK. The SDK validates a candidate session before replacing credentials:
  the runtime obtains its product token, reads `/configurations` and resolves its data profile.
  Until admission succeeds, the old session stays usable. Candidate failure never signs out the
  old account. A refusal of the currently open organization blocks it; a previously refused
  session stays blocked even when reauthentication fails offline. Private sessions are independent
  of cloud notifications. A sign-in without a portal choice is rejected instead of becoming community.
- **Identity display:** SDK `account.displayName` is a presentation field, not an identity key.
  `maskedIdentifier` supplies a phone/email fallback; `username` is never displayed as a substitute
  for a missing name. The SDK supplements ID-token claims with issuer-bound, subject-checked
  userinfo. The profile's local nickname and avatar remain independent.
- **Callback recovery:** `receiveRedirect` is the one completion entry for the live auth browser
  and the callback route, including cold starts. The SDK restores pending PKCE state from secure
  storage; duplicate browser/deep-link delivery shares one completion and one activation. Native
  callback URLs use the installed scheme: `cherrystudio://auth/callback`,
  `cherrystudio-dev://auth/callback` or `cherrystudio-preview://auth/callback`. Register each URL on
  the corresponding IdP client before testing that build; a production-only redirect cannot open
  an Android development package. Unrecognized schemes disable cloud sign-in.
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
- **Switching organizations:** a cloud account opens the portal chooser using the existing browser
  session; the user chooses community or an organization there. Private accounts have no portal
  choice and switch accounts instead. Refused sessions and a previously unsuccessful
  browser logout still force authentication. Choosing the open identity keeps the app in place;
  another organization or returning to community reloads into its existing data directory.
  Returning A → B → A reuses A's profile, and community always reuses the installation's single
  local profile.
- **Switching accounts:** every account opens the sign-in method page. Community and organization
  accounts sign in through Accounts Portal, which explicitly asks for authentication; a private
  deployment uses the page's private sign-in form. Dismissing the browser preserves the account
  and data that were open.
- **Sign-out:** a cloud sign-out revokes the refresh token and ends the portal's browser sign-in;
  local tokens, profile choice and product tokens are forgotten even when the server is
  unreachable, which marks the browser session stale for the next sign-in. A private sign-out
  deletes that deployment's credentials; the deployment has no revocation endpoint yet. An
  enterprise or private sign-out keeps the profile's data on the device and returns to the
  community data. Signing in again to the same identity, matched by server, issuer, subject and
  organization (or server, user and password sign-in), reopens that data.
- **Failed entry:** the SDK discards the candidate and revokes its refresh token; the previous
  session and active data selection stay in place. A successful SDK commit followed by a local
  activation/reload failure remains gated when identities differ; it never opens old organization
  data using new credentials.
- **Errors:** transport failures, invalid responses and credential refusals have separate messages.
  Other failures retain their original cause in diagnostics and show an account-action failure;
  persistence and reload failures are never presented as connection failures.

Build inputs live in `app.config.ts` under `extra.accountsPortal` (`ACCOUNTS_PORTAL_*`). Every build
profile reads them from the environment; the repository has no deployment defaults. Set local
values in the Git-ignored repository-root `.env.local`, using the keys in `.env.example`; configure
cloud builds in their selected EAS environment. The local build wrapper loads `.env.local` before
starting EAS. Register the installed app's native callback scheme with the corresponding Accounts
Portal client, as described above.

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
  failure leaves the previous resource configuration in place. Provider, model, Agent and MCP
  inventories must be explicit arrays; missing or null values are invalid, while empty arrays
  mean removal. An Agent's Skill and MCP inventories follow the same rule. An Agent whose setup cannot be read
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
endpoints or capabilities, non-HTTP MCP transports, and Agents without a usable model. A model
the server lists with capabilities keeps exactly those; one listed without them takes the model
registry's, and the next sync after a catalog download rewrites them. As on the
desktop, an Agent's default model is its primary model (or, when that is unusable, its first usable
pool model) and its allowed models are the sorted usable pool including the default. Plan/small models and turn limits are ignored. Any permission mode
other than bypass
maps to the default ask-first approval mode. Skills are installed whether or not Mobile can run
them.

## Ownership

Core tables gain one nullable column, `managed_remote_id`, on `agent`, `mcp_server` and
`agent_global_skill`. A non-null value is the server id of a delivered resource. A delivered Agent
also stores `default_model_id` and `allowed_model_ids`, the desktop's names. Providers and models need no marker: enterprise
profiles skip preset provider seeding, users cannot create
providers, and every provider comes from the server.

| Resource | Server removal |
| --- | --- |
| Provider, model | Deleted |
| MCP server | Deleted with its Agent bindings |
| Skill | Deleted with its bindings |
| Agent | Detached: `managed_remote_id`, `default_model_id`, `allowed_model_ids` and instructions are cleared, Skill and MCP bindings removed, conversations kept; it becomes an ordinary user Agent |

The gateway key from `/configurations` is stored on each enterprise provider like any API key.
Default models are written to the ordinary preference keys.
The three organization-owned default-model keys are declared in the shared preference schema;
ordinary preference writes cannot change them in enterprise profiles.
An unavailable configured model retains its identity and is shown as unavailable in settings;
the client never substitutes the first supported model.

## Read-Only Rules

One rule table, `src/shared/data/managedPolicy.ts`, answers what the user may change; data
services enforce it and screens read it, so neither side asks which edition is running.
`editionCapabilities()` holds the profile-wide settings, named as on the desktop: provider settings,
model settings, provider onboarding and desktop configuration import are all off in an enterprise
profile. `agentPolicy()` and `managedResourcePolicy()` describe one resource: whether it is managed,
which fields it accepts, whether it can be deleted or rebound, whether its secrets show, and the
models it allows.

- In an enterprise profile, every provider and model mutation is rejected.
- A managed Agent accepts only `MANAGED_AGENT_EDITABLE_FIELDS` (model, mode, tool approval mode,
  capability toggles). Its other fields, Skill and tool bindings, avatar and deletion are rejected.
  The model must come from `allowed_model_ids`, and only several allowed models leave a choice. As
  on the desktop, sync keeps the user's pick while the pool still holds it; a withdrawn pick, or a
  previous default left in place, moves to the server's default.
- Managed MCP servers and Skills cannot be updated, deleted, uninstalled or authorized.

Services apply the table at their write boundaries (`src/backend/data/services/managedResources.ts`).
A check that needs nothing from the method's transaction wraps the method: `guardMethods` runs it
before the original body, which stays free of policy. A check that must read the row in the same
write transaction stays in the method: Agent updates, Skill and tool bindings, Skill edits and MCP
OAuth saves. Agent updates compare and authorize submitted fields there, so a stale full form cannot
overwrite a concurrently changed organization-owned field. The enterprise sync writes through its
own transaction. The Agent management tools refuse to read or change a managed Agent at all,
including its user-adjustable fields; `agent_list` marks it `isManaged`.

The UI applies the same table through `src/frontend/components/Policy`. A screen declares the
resource it shows with `PolicyScope` (or `withResourcePolicy` for list rows and
`capabilityPolicy` for profile-owned settings pages). Organization-owned content is not hidden or
dimmed; it renders locked, in one visual language:

- **Locked group.** `PolicyGroup` encloses what the organization owns in a CherryUI `LockedGroup`:
  an outlined card headed by the building mark and "Managed by {organization}". Pages the
  organization owns entirely (provider list and details, model details, default models, delivered
  MCP servers and Skills) put their owned content in one group; the managed Agent editor gathers
  instructions, a single allowed model and its bindings into one group above the settings the user
  may still change.
- **Locked variants.** Inside a group, CherryUI switches, selections, inputs, tabs and editing rows
  render their locked variant: full contrast without edit affordances (a switch keeps a neutral
  track), and the reason in an info popover when pressed. The group's header is the only mark in
  the group. Rows that only navigate or copy stay live. A single locked control outside a group,
  such as the composer's one-model pill or a desktop's provider import, uses the same variant with
  the mark in place of its affordance. Changes the organization owns (add, sync, delete, reorder) do not appear,
  and secrets read "Hidden".
- **Mark.** `ManagedMark` follows a delivered Agent, MCP server or Skill's name in lists;
  `CapabilityLabel` marks settings entries the organization owns.

Model pickers offer only the scope's allowed models, and "answer with another model" disappears
with a single model. Business screens do not branch on the edition or on `isManaged`. Users may still
create their own Agents, MCP servers and Skills.
Every profile seeds the Cherry Agent once, after the first resource sync so it takes the
organization's default model; delivered Agents do not replace it, and a deleted one is not recreated.

## Backup

Signing out keeps an organization's data on the device, so switching accounts never needs a
backup. An enterprise backup only moves that data to another device or across a reinstall.

An enterprise export keeps conversations and Agents, including delivered Agents with their
`managed_remote_id` markers. It carries none of the organization's own content: provider rows remain
only as the model references Agents and messages hold, with their keys removed; delivered Agents
lose their instructions; delivered MCP servers with their tool bindings, delivered Skills, the
organization's default models and the sync state are left out. The copy is vacuumed so removed
values do not survive in free pages. It records the enterprise identity it came from (`app_state`
key `backup.profile`).

A backup restores only into the data it came from: local data into the local profile, an enterprise
backup into the same identity. Any other combination is refused before confirmation. Without a sync
state, a restored enterprise profile runs the blocking first sync before it opens, so a restore that
cannot reach the server, or whose session is refused, rolls back; the confirmation says so.
Restored remote OAuth MCP connections retain their client configuration but receive fresh,
unresolved authorization references and are disabled until the user authorizes them again.

## Code Placement

Enterprise implementation lives in `src/backend/services/enterprise`. Only bootstrap and
`serviceRegistry.ts` import it (ESLint `enterpriseIsolation`). Shared rules live with their owners:
the column in the core schemas, the rule table in `src/shared/data/managedPolicy.ts`, its enforcement
in data services, and its UI application in `src/frontend/components/Policy`.
`CODEOWNERS` names the enterprise implementation and the installation profile bootstrap.
Enterprise import allow/deny cases live in `scripts/__tests__/architectureBoundaries.test.ts`;
resource and account regressions stay with their owning services.
