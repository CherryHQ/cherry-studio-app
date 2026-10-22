# Enterprise Edition

Enterprise users sign in with Accounts Portal and receive model providers, models, default models,
Agents, Skills and MCP servers from their organization's enterprise server. Community users and
local data are unaffected.

## Data Profiles

Each enterprise identity owns a separate data profile; local data is the `local` profile. An
identity is the enterprise server id (`serverUniqueId`), the IdP issuer and subject, and the Accounts
Portal organization profile id. Tokens, roles and display names are not part of it.

| Owner | Location |
| --- | --- |
| Installation directory of profiles (`ProfileRegistry`) | MMKV `cherry-installation-profiles` |
| Accounts Portal session and enterprise address | SecureStore `accounts-portal.*`, MMKV `cherry-installation-account` |
| Local profile | Original Documents, SQLite, MMKV and SecureStore names |
| Enterprise profile | `Documents/profiles/<id>/`; MMKV stores and SecureStore keys prefixed `profile.<id>.` |

The entry point (`index.ts`) selects the active profile before any store opens
(`src/bootstrap/profile/installationProfiles.ts`). `src/shared/data/activeProfile.ts` exposes it for
the rest of the runtime. Sign-in, sign-out, organization switching and returning to local data write
the next profile to the registry and reload JavaScript with `reloadAppAsync`. Nothing swaps stores
in place. Backup generations stay inside a profile root; credentials and stores are scoped by
profile only, never by generation, so a restore keeps them.

## Account

`EnterpriseAccount` (`src/backend/services/enterprise/account`) owns the installation's single
Accounts Portal SDK instance, composed natively in `src/bootstrap/profile/enterpriseAccount.ts`. The
SDK owns PKCE, token storage and refresh. Product requests use `getProductToken(address, profile)`.
Sign-in reads `/configurations` once to learn the server id before the profile is chosen.

A cold start opens the last profile without the network. After startup, `verify()` checks that the
restored session still matches the profile. Only an explicit rejection (401/403, `signed_out`) marks
the account as needing sign-in. The profile stays readable and only enterprise requests fail.

Build inputs live in `app.config.ts` under `extra.accountsPortal` (`ACCOUNTS_PORTAL_*`). Non-production
builds default to the cn-dev staging deployment. Production has no default. Every build uses the
production callback `cherrystudio://auth/callback`, the only one registered with the Accounts
Portal client. iOS auth sessions capture it in any build; on Android only the production app
receives it, so development and preview builds may not return from the browser.

## Synchronization

`EnterpriseSyncService` runs only in enterprise profiles:

- **Triggers:** after startup, every `sync_interval` minutes (server setting, default 10), and on
  return to the foreground when the last attempt is at least five minutes old.
- **First launch:** only the first launch of a profile waits for a sync. Later launches use what the
  database already holds.
- **Success:** a sync reads `/configurations` and every Agent's `/agents/:id/setup`. It downloads
  only Skill packages whose server revision changed. Then it writes everything in one transaction.
- **Failure:** nothing changes and the failure is only logged. Nothing is closed before the new
  configuration is ready. No sync state is shown to the user.

Unsupported items are skipped one by one and logged: unknown provider types, endpoints or
capabilities, non-HTTP MCP transports, and Agents without a usable model. An Agent keeps its first
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
| Agent | Detached: `managed_remote_id` and instructions are cleared, tool bindings removed, conversations kept; it becomes an ordinary user Agent |

The gateway key from `/configurations` is stored on each enterprise provider like any API key.
Default models are written to the ordinary preference keys.

## Read-Only Rules

Services enforce the rules (`src/backend/data/services/managedResources.ts`). The enterprise sync
writes through its own transaction:

- In an enterprise profile, every provider and model mutation is rejected.
- A managed Agent accepts only `MANAGED_AGENT_EDITABLE_FIELDS` (model, mode, tool approval mode,
  capability toggles). Its other fields, Skill and tool bindings, avatar and deletion are rejected.
- Managed MCP servers and Skills cannot be updated, deleted or uninstalled.

The UI hides provider creation and configuration, shows default models read-only, marks delivered
resources with `ManagedBadge`, and never shows a managed Agent's instructions or a managed MCP
server's headers. Users may still create their own Agents, MCP servers and Skills.

## Backup

An export strips enterprise data from the database copy. It deletes managed MCP servers and Skills,
detaches managed Agents, and in an enterprise profile deletes all providers. The archive therefore
restores into any profile. Restoring into an enterprise profile deletes the backup's providers and
clears the sync state; the next launch syncs again.

## Code Placement

Enterprise implementation lives in `src/backend/services/enterprise`. Only bootstrap and
`serviceRegistry.ts` import it (ESLint `enterpriseIsolation`). Shared rules live with their owners:
the column in the core schemas, guards in data services, `ManagedBadge` in `src/frontend/components`.
