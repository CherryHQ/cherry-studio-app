# Parallel Device Testing

This guide owns local coding-agent self-test environments. Each platform has one resident test
device that every workspace reuses under an exclusive lease. Only a task that needs a device while
another task is actively using the resident one gets a temporary device, deleted when its lease
ends. Native differences
between branches are handled by reinstalling a cached development client, not by creating devices. Physical devices
and the primary user installation are never self-test targets.

> Status: host lifecycle implemented; device acceptance not run.
>
> `pnpm agent:env` owns test-device registration, leases, native fingerprints, development-artifact
> caching, launch, release, archival and reconciliation. Configuration snapshot/import remains
> design below.

Apply the user's active authorization. `build` and `start` require the corresponding task
authorization. Apart from temporary devices, no command creates or deletes a device, and none
downloads SDK images. Never invoke `build` or `start` merely to verify this tooling.

## Registry And Lock

Ownership lives at `$CONDUCTOR_ROOT_PATH/.local/agent-self-testing/state.json`, outside disposable
worktrees: workspaces, resident and temporary devices with their leases and installed artifacts, Metro
processes started by the tool, and cached artifacts under `artifacts/`. Workspace logs live under
`.context/agent-self-testing/`. Do not store credentials in the registry.

A kernel-held, nonblocking lock serializes registry changes across agents; a busy operation reports
a retryable error and a crashed process releases it. `build` holds the lock only while reading and
publishing registry entries, never during compilation.

## Test Devices

Create or pick a simulator/emulator yourself, then register it as the resident device by stable iOS
UDID or Android AVD ID:

```bash
pnpm agent:env status
pnpm agent:env adopt --platform ios --device <udid>
```

Registering again for the same platform replaces the unleased previous registration; the old device
is left untouched. Never register a daily-use installation. Unregistered devices are ignored: they
are neither used nor stopped, and running ones do not block a launch.

The resident device is never deleted. A lease is held by one task session (default
`CONDUCTOR_SESSION_ID`) until `release`, workspace retirement, or 60 minutes without `agent-device`
requests from that session (measured from the session's request records, or from the last `start`
when no session exists). After that idle period, the next `start` closes the stale session and
takes over the resident device.

When `start` finds the resident device under another task's live lease, it creates a temporary device named
`Cherry_temp_<platform>_<hash>` with the resident device's type and installed runtime (iOS) or system
image (Android). It starts with empty app data. The task keeps reusing it; `release`, retirement of
its workspace, or its own idle expiry deletes it. An interrupted creation can leave an unregistered
`Cherry_temp_` device; delete it manually.

## Native Compatibility And Development Builds

`fingerprint` uses the installed `expo/fingerprint` API under the development profile, with the
platform, architecture, native dependency/module inputs, evaluated Expo config and explicit local
config-plugin inputs. Package scripts, Git ignore files and generated root `ios/`/`android/`
directories are excluded, consistent with the local EAS source archive. Keep additions to build
inputs covered in [`native.ts`](../../scripts/agentEnvironment/native.ts).

```bash
pnpm agent:env fingerprint --platform ios
pnpm agent:env build --platform ios [--source <checkout>]
```

`build` is an explicit local EAS development build (`development-simulator` on iOS, `development`
on Android); it never produces a release build. A verified cache hit returns immediately. New
artifacts are checksummed and published only after a successful build with an unchanged
fingerprint. Staging left by a dead build is reclaimed by the next reconciliation.

## Start And App Data

```bash
pnpm agent:env start --platform ios [--reset-data]
```

`start` reconciles, takes the lease, reuses the Metro process already serving this workspace on
`CONDUCTOR_PORT` (for example Conductor's Run script) or starts one, boots the device, installs the
artifact matching this workspace's fingerprint when a different one is installed, and relaunches the
development client against this Metro's exact Expo URL. It reports a missing artifact instead of
building. A port served by another workspace stops the launch; no process is killed.

Reinstalling a development client keeps the app's data. When the output reports `dataFromWorkspace`,
the data was last used by another workspace and may carry a newer database schema; use
`--reset-data` to reinstall with empty data when that matters or when the scenario needs a first
run. Output from `start` includes the `agent-device` session name; keep commands serial and target
the leased device explicitly. An app opening is not a successful model/tool call or completed
scenario.

## Release, Archive And Reconciliation

```bash
pnpm agent:env release
pnpm agent:env archive
pnpm agent:env reconcile [--dry-run]
```

- `release` closes the task's session, shuts down its device and stops the Metro process the tool
  started. The resident device is kept; a temporary device is deleted. Call it after self-testing
  and before waiting for review. A failed shutdown or deletion keeps the lease and reports a blocker.
- `archive` marks the current workspace retired and reconciles. The shared
  `.conductor/settings.toml` runs it from Conductor's archive hook; machine-local overrides can take
  precedence.
- `reconcile` runs inside `start` and `archive`. It releases leases, temporary devices and Metro
  processes of retired workspaces, deletes idle temporary devices, forgets their records, reclaims dead build staging, and removes artifacts older than
  seven days that are neither installed nor among the latest two per platform.

Retirement requires either `archive` or both a Git worktree listing without the workspace and the
absence of its Git administration directory; elapsed time, names or ports alone are not proof. Before
signalling a Metro group, reconciliation verifies PID/start time, process group, working directory
and launch command; a group surviving its leader is preserved and reported. Records are removed only
after confirmed completion.

Evidence in `.context/agent-self-testing/` disappears with the workspace; preserve what is needed
before archival. Conductor setup installs dependencies only, and its Metro command uses `pnpm dev`,
not `dev:clear`.

## Self-Test Preparation

> Status: design
>
> The following configuration preparation contract is accepted. Configuration export/import,
> primary-source registration and automatic scenario-data handoff are not implemented.
> The host lifecycle commands above are implemented separately; they do not satisfy this preparation contract.

An ordinary configured self-test reuses a compatible development client, copies the primary
environment's user configuration into an independent scenario database on the exclusively leased test device, and creates conversation
or file data only as its scenario requires. An explicit first-run scenario instead uses fresh app
defaults and requires no primary registration, configuration snapshot, or import. Device ownership,
artifact compatibility, authorization, and reporting rules apply to both.

The app currently initializes `cherry.db` through
[DbService](../../src/backend/data/db/DbService.ts). Its
[seeders](../../src/backend/data/db/seeding/index.ts) install default preferences and recommended
providers, not the primary environment's Agents, credentials, or MCP setup. Until preparation tools
exist, report which steps were actually performed and which capabilities are missing. Conductor
setup/run scripts or an app opening with defaults do not prove configured preparation succeeded.

### Primary Source And Local State

Register one explicit primary Cherry Mobile installation in repository-local machine configuration:
platform, stable device identity and expected name, application identifier, and source kind. The
source is the installed app's sandbox, not a repository directory or Metro process. Resolve its
current app container on export; for Android, resolve the current serial from the stable emulator
identity. Never choose the first booted device or guess a source from a workspace name. Missing or
ambiguous registration blocks configured preparation until the source is identified.

Direct extraction initially targets Mobile simulators/emulators. Cherry Desktop or physical-device
sources require a supported adapter/export format; their databases are not interchangeable with
Mobile's. Never share the primary's live writable database or app container with a workspace. Never
reset the primary, migrate it using a test branch, use it as the acceptance device, or include it in
workspace cleanup.

Planned storage ownership:

| Location | Contents |
| --- | --- |
| `$CONDUCTOR_ROOT_PATH/.local/agent-self-testing/` | Implemented resource registry/artifact cache; planned source registration and configuration snapshots |
| Workspace `.context/agent-self-testing/` | Preparation receipt, scenario evidence, timing, and temporary transfers |
| Leased test device's app container | Writable scenario database/assets; shared by workspaces until reset or a future import replaces it |

Planned configuration snapshots intentionally contain credentials. Keep them and temporary backups private to the local
user, outside version control and logs. Export actual credentials, not redacted UI projections.
Publish shared snapshots/artifacts atomically and immutably. Remove temporary full-database backups
after extracting configuration; retain only the allowed configuration payload and its assets.

### Configuration Baseline

Copy the complete user-maintained configuration graph, including disabled entries, with stable
identities and relationships. Here **Agent** means the user-configured assistant in Cherry Mobile,
while **coding agent** means the executor of this workflow.

| Domain | Included configuration |
| --- | --- |
| `user_provider` | Addresses, endpoint overrides, API keys, authentication, custom settings, enablement, and ordering |
| `user_model` | Provider associations, custom models, preset references/overrides, parameters, visibility, enablement, and ordering |
| `agent` | Non-deleted Agent definitions, prompts, selected models, capabilities, approval preferences, ordering, and avatar references |
| `mcp_server` | Service addresses, static authentication headers, enablement, and disabled-tool settings |
| `agent_tool_binding` | Bindings of copied Agents, including MCP/tool identities, enablement, and stored approval settings |
| `preference` | All user-maintained preferences: model defaults, search settings/credentials, naming, profile, language, and appearance |
| Configuration assets | Managed Agent/user avatars and provider images belonging to copied configuration |

The [schema registry](../../src/backend/data/db/schemas/index.ts) and
[preference schema](../../src/shared/data/preference/preferenceSchema.ts) own these fields. New
tables/preferences require classification before inclusion; do not copy unknown domains wholesale
or silently drop unsupported configuration fields.

Plugin authorization metadata and native SecureStore credentials need a dedicated transfer or
reauthorization contract; copying SQLite references does not copy credentials. Desktop pairing and
device identity remain target-owned. The existing full backup deliberately excludes these secrets
and includes conversation history, so it is not a configuration-only self-test import.

Initialize installation state separately: `app.onboarding.status` is `completed` for configured
acceptance and `unseen` for an explicit first-run scenario. Device permission grants remain
platform-owned. Preserve user settings such as theme/language unless the scenario changes them.

Copy configuration-owned images without copying the entire Documents directory. Remap sandbox-local
references through the owning image storage; do not retain source-device absolute paths or temporary
`blob:`/`content:` references. Missing optional images may fall back to defaults with a recorded
omission; scenarios testing those images require the actual assets.

| Excluded data | Baseline behavior |
| --- | --- |
| `agent_session`, `agent_session_message` | No inherited conversations/messages |
| `file_entry`, library files, and attachments | Empty file library |
| `painting` and its input/output files | No inherited image-generation history |
| `job`, `ai_usage_record` | No inherited queued/running work or invocation history |
| Source migration journal, `app_state`, FTS indexes, and caches | Target owns its migration/seed journals, indexes, and runtime state |

Exclude soft-deleted Agents and their bindings. Rebuild MCP connections and discovered tool catalogs
in the target runtime. Copy stored policies without overriding effective product approval rules;
report absent authentication or device-incompatible endpoints for affected scenarios instead of
silently rewriting destinations or enabling disabled tools.

### Snapshot And Import

A snapshot records format version, opaque identity, source app/schema provenance, capture time,
per-domain counts, and an asset manifest. Record provider-catalog versions as provenance; use target
catalog resolution instead of copying opaque registry caches. Report unresolved preset references.

1. Capture a consistent source database using the SQLite backup API or an equivalent supported
   mechanism. Plain-copying a live `cherry.db`, or its live sidecars separately, does not guarantee
   inclusion of pending WAL updates. See [SQLite backup](https://sqlite.org/backup.html).
2. Extract only the allowed configuration/assets and validate before publishing. If assets change
   during capture, retry or report the documented optional-image omission.
3. Preflight against the target branch's import/schema contract and catalogs before altering an
   existing target or running migrations. Require provider/model/Agent associations and model-valued
   preferences to resolve. Preserve intentionally dangling MCP bindings as repairable configuration
   and report them; only dependent scenarios are blocked. Reject unsupported schemas/fields without
   changing the target. Initially, exact source-schema matching is sufficient; never migrate or
   downgrade the primary database to obtain compatibility.
4. Initialize a fresh target using its own migrations/seeders in a development-only maintenance
   phase. Existing targets must already have a supported schema; application upgrades are separate
   from configuration refresh. Keep ordinary app services, jobs, MCP connections, and user
   interaction stopped throughout import.
5. Replace a fresh target's seeded configuration in one write transaction: providers before models,
   then Agents and MCP definitions before bindings, followed by preferences. Preserve target-owned
   migration/seed journals. Intentionally empty source configuration stays empty, without defaults
   being re-added to replace deliberate user deletions.
6. Stage assets before committing references. Persist snapshot identity and import completion with
   the data, then write the workspace receipt. On failure, roll back configuration and discard only
   staged assets. Recover interruptions before opening the app; a committed import must not run
   again as an unrecorded reset. Never expose partial configuration or dangling required assets.
7. Fully relaunch the target against its workspace Metro and check configuration availability for
   the scenario. Import success alone does not prove credentials or remote services work.

Database migration acceptance uses a separate explicit scenario, not this configuration baseline.

### Reuse And Refresh

Successful preparation pins the snapshot identity. Re-running preparation validates the exclusive device lease,
app, and receipt and reuses existing data; it must not duplicate imports, reset scenario content, or
overwrite workspace configuration edits. A newer primary snapshot does not automatically change an
already prepared workspace.

Explicit refresh selects a new snapshot and shows the configuration delta, including deletions and
relationship changes. Compare the target with the pinned baseline: locally edited/deleted baseline
records that would be overwritten are conflicts. Reject them unless the requested refresh explicitly
covers replacing those changes. Apply existing task authorization without a second confirmation.

Refresh replaces the imported baseline atomically with a local rollback backup. Reject changes that
would orphan existing conversations, invalidate required references, or collide with independently
created configuration. Keep the target usable on rejection. A clean reset is separate and requires
authorization to discard that workspace's scenario data; routine preparation never resets it.


## Persistence Failures After Fast Refresh

Fast Refresh and a Metro reload do not restart the native app process. During development, an old
Expo SQLite connection can occasionally survive a refresh even though the current `DbService`
connection reports no active transaction. The same app process may then hold two sets of
`cherry.db` and WAL file descriptors, and SQLite-backed actions such as saving a preference fail at
`BEGIN IMMEDIATE` with `SQLiteErrorException: database is locked`.

Before changing UI or persistence code in response to this failure:

1. Capture the app log and confirm that the failure occurs at `BEGIN IMMEDIATE`.
2. Fully relaunch the app with the leased-device `agent-device open ... --relaunch` command. A Metro reload is not a valid control experiment for this failure.
3. Repeat the exact save action. If it succeeds, classify the failure as a stale development
   runtime connection and remove any temporary diagnostic logging before committing.
4. If it still fails after the full relaunch, investigate transaction ownership and competing
   processes. `lsof` on `cherry.db`, `cherry.db-wal`, and `cherry.db-shm` can distinguish duplicate
   handles in the app process from an external lock holder.

Always perform persistence acceptance from a fully relaunched app after using Fast Refresh. Do not
delete the simulator database to clear this symptom; that destroys the state needed to reproduce a
real transaction-lifecycle bug.
