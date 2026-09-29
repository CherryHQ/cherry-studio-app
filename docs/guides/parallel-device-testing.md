# Parallel Device Testing

This guide owns local coding-agent self-test environments. Reuse shared simulators/emulators for
compatible native code, reserve named native variants only when required, and reconcile resources
at the next agent startup when a workspace disappears without cleanup. Physical devices and the
primary user installation are never self-test targets.

> Status: host lifecycle implemented; automated tests and device acceptance not run in this change.
>
> `pnpm agent:env` owns discovery, persistent ownership, exclusive leases, native fingerprints,
> development-artifact caching, provisioning, launch, release, archival and reconciliation.
> Configuration snapshot/import and automatic scenario-data handoff remain design below.

Apply the user's active authorization. Startup reconciliation is the agreed maintenance action for
registered resources; it does not authorize builds, device creation/boot, tests or external model/tool
calls. `build`, `provision` and `start` require the corresponding task authorization. Never invoke
those commands merely to verify this tooling implementation.

## Agent Startup And Recovery

At the beginning of a local macOS coding-agent session, run:

```bash
pnpm agent:env reconcile
```

`prepare` and `start` also reconcile before admission. `status` and
`reconcile --dry-run` inspect without changing the registry or devices. Startup does not compute
native fingerprints, boot devices, install packages, build, clear application data or clear Metro
caches. Missing dependencies/tooling are reported, not installed automatically.

Ownership lives at `$CONDUCTOR_ROOT_PATH/.local/agent-self-testing/state.json`, outside disposable
worktrees. It records repository identity, workspace ID/path/Git administration directory, stable
device identity/name, Android AVD path, device role, consumers, lease/session, installed artifact,
Metro process identity and provisioning intents. Artifacts live in its `artifacts/` directory;
workspace evidence/logs live under `.context/agent-self-testing/`. Do not store credentials in the
resource registry. It is separate from future secret-bearing configuration snapshots.

Retirement requires either the explicit `archive` command or both an authoritative Git worktree
listing without the workspace and absence of its saved Git administration directory. Leftover
untracked workspace directories do not prevent that second proof. Missing/failed inventory,
renaming, elapsed time or a stale-looking device name alone is not proof. A workspace still listed
by Git remains active. If an external archiver retains its Git registration, it remains protected
until an explicit archive signal is recorded. The installed Conductor CLI's cloud inventory is not
used as a local-workspace authority.

A kernel-held, nonblocking repository lock serializes mutating commands across agents. A busy
operation reports a retryable error; a process crash releases the lock. There is no timeout-based
lease stealing. An abandoned lease in a still-active workspace requires an explicit owner release;
a later agent must not guess that another session is dead.

Legacy/unregistered devices appear in `status` but are never adopted, stopped or deleted by startup.
Inspect them once and register only known test resources. Failed/interrupted creates retain an
intent for inspection; they are not inferred from a matching name. Cleanup reports partial failures
and preserves records for retry. Archive hooks are optional accelerators, not the only cleanup path.

## Shared Devices And Native Variants

There is at most one registered shared device per platform and one active self-test lease across
platforms. Only the requested platform is started. Other running devices, including unregistered
ones, block launch rather than being shut down. Coding agents can continue independent code work
while waiting for the device. Creating a PR or finding a busy device never justifies another device.

| Role | Use | Lifetime |
| --- | --- | --- |
| `primary` | User's source installation; protected from leasing and cleanup | User-owned |
| `shared` | Common development client for the public native baseline | Retained; shut down on release |
| `native` | A branch with a different native fingerprint | Reused by compatible tasks; optionally disposable |

Discover first:

```bash
pnpm agent:env status
```

Register an explicitly selected existing device with its stable iOS UDID or Android AVD ID:

```bash
pnpm agent:env adopt --platform ios --device <udid> --role shared
pnpm agent:env adopt --platform android --device <avd-id> --role primary
```

`--role native --disposable` explicitly admits automatic deletion after every recorded consumer
retires. An adopted native device without that flag is retained. Adoption grants ownership, not
proof of its installed binary or its data baseline; launch installs a verified cached artifact.
Never adopt a daily-use installation as a disposable test device.

Only when no reusable compatible device exists and creation is authorized:

```bash
pnpm agent:env provision --platform ios --template <existing-udid>
pnpm agent:env provision --platform android --template <existing-avd-id>
```

Provisioning selects the shared/native role from the fingerprint and creates a distinct named device
using an existing installed runtime/system image. It copies no app data, does not boot, and downloads
no SDK image. Names include the repository or native fingerprint rather than a PR/workspace name.
The creating provisioner also owns deletion. Android inventory refreshes the serial from the stable
AVD ID and checks its absolute path; no operation targets a physical device or deletes by serial.

## Native Compatibility And Development Builds

The public baseline is computed from a clean checkout at the locally known `origin/main`. No command
fetches, resets, checks out or updates a user's branch. Preparation recomputes the public fingerprint from the saved baseline checkout (initially the main
repository checkout), because native environment inputs can change without a commit. It reports a
prerequisite if that checkout is not clean and at the current reference. A compatible clean worktree
can be supplied explicitly:

```bash
pnpm agent:env baseline --platform ios --source <clean-main-checkout>
pnpm agent:env fingerprint --platform ios
```

Fingerprinting uses the installed `expo/fingerprint` API under the development profile, with the
platform, architecture, native dependency/module inputs, evaluated Expo config and explicit local
config-plugin/config inputs. Package script and Git ignore-file changes are excluded. Generated root `ios/` and
`android/` directories are excluded consistently with the local EAS source archive: edit native
sources/plugins in their repository owners, not generated prebuild output. Fingerprints run only
when preparing/building, not at every agent startup. App versions, PR names and artifact age are not
compatibility checks. The fingerprint source is in
[`native.ts`](../../scripts/agentEnvironment/native.ts); keep additions to build inputs covered there.

The `build` command is an explicit local EAS development build. It never produces a release build:

```bash
pnpm agent:env build --platform ios --source <checkout>
pnpm agent:env build --platform android --source <checkout>
```

It delegates to `pnpm build:local`, selecting `development-simulator` for iOS and `development`
for Android. iOS simulator artifacts and physical-device IPAs are not interchangeable. A verified
cache hit reuses the artifact. New artifacts are checksummed and published only after a successful
build and an unchanged post-build fingerprint. Interrupted staging is reclaimed at the next sweep.
These internal reusable artifacts are not distributable release packages.

When public native inputs change, refresh the baseline and build its matching artifact, then start
on the existing shared device. A branch-specific artifact never replaces the public baseline.
`prepare`/`start` report missing artifacts instead of building silently. Old installed artifacts stay
available for rollback; installation completion updates the device record.

## Prepare, Start And Data Handoff

Commands use a stable task session (`CODEX_THREAD_ID` or `CLAUDE_CODE_SESSION_ID` can supply the default).
The output includes the actual, repository-managed `agent-device` session name; use that name for
subsequent interaction commands. Different sessions in the same workspace still cannot overlap.

```bash
pnpm agent:env prepare --platform ios --session <task-id>
pnpm agent:env start --platform ios --session <task-id> --data-ready
```

Preparation acquires the device exclusively without booting it. It checks native compatibility,
artifacts, competing sessions and the single-running-device budget. Startup rechecks preparation,
starts or reuses its recorded Metro process on `CONDUCTOR_PORT`, waits for readiness, boots the
selected device, installs only when the artifact changed, and fully relaunches the development app
against the exact URL obtained from this Metro's Expo endpoint. It preserves Metro's cache.

Shared-device data is separate from native compatibility. Before switching workspaces, preserve any
needed previous scenario evidence/state and establish the new scenario's compatible data baseline
under the lease. A schema change can require a data handoff even without native changes.
`--data-ready` is an explicit acknowledgement of this preparation, not an importer or a reset command.
The tool refuses first use/cross-workspace launch without it; it does not claim configuration import
or scenario success. Reusing the same workspace is not proof that a newly changed database schema is
compatible. Do not run destructive first-run flows against data required by another task.

Use the project `agent-device` and `react-devtools` skills for application interaction. Keep commands
for a session serial and target the leased device explicitly. Tool-specific command shapes come from
installed CLI help. An app opening is not a successful model/tool call or a completed scenario.

## Release, Archive And Cache Cleanup

```bash
pnpm agent:env release --session <task-id>
pnpm agent:env archive
pnpm agent:env gc
```

- `release` closes the task session, shuts down its test device and stops its recorded Metro process.
  It retains the device/data and artifact for reuse. Call it after self-testing or before waiting for
  PR review. A failed shutdown retains the lease and blocks process cleanup for that session.
- `archive` durably marks the current workspace retired and reconciles. Shared devices survive;
  disposable native devices are deleted only when every consumer retired and no lease/foreign session
  remains. Re-entering the actual workspace through a mutating command registers it as active again.
- `reconcile` performs retirement cleanup even if the previous agent never observed archival. It
  verifies device identity/name/path and sessions before touching it, and verifies process PID/start
  time, process group, working directory and launch command before signalling recorded Metro groups.
  Port numbers are never used as authority to kill a process. Records are removed only after confirmed
  completion; unknown identities are retained with a blocker. If a Metro process group survives its
  recorded leader, preserve and report it instead of claiming that its children were reclaimed.
- `gc` explicitly invokes the same sweep. Startup reconciliation also expires unreferenced cached
  artifacts after seven days, retaining device references,
  the public baseline and the latest two artifacts per platform. Primary data, user SDK/runtime images,
  global package/build caches and release artifacts are outside its deletion scope.

A failed scenario retains evidence in `.context/agent-self-testing/`; preserve needed evidence before
archival removes the workspace. Application data is retained on release, but disposable-device
archival deletes it. Host configuration transfers must be removed when a future importer finishes.
Startup does not implement that importer or wipe shared application data.

Conductor setup should install dependencies only. Its normal Metro command uses `pnpm dev`, not
`dev:clear`. The shared `.conductor/settings.toml` wires an archive fallback with a guard for branches
without this tool. Machine-local overrides can take precedence; do not claim that committing a
settings file immediately activates it on every existing workspace. AGENTS startup instructions and
mandatory prepare/start reconciliation supply the recovery path independently of that hook.

The first implementation is deliberately conservative about missing CLI inventory, unknown legacy
devices, active-workspace abandoned leases and changes to recorded identities. Report these as
blockers rather than claiming complete reclamation. Device acceptance must cover concurrent starts,
crashes during provisioning/build/launch, session mismatch, repeated cleanup and both platforms.
Focused regression suites are local tooling checks selected by [Testing And CI](./testing-and-ci.md).

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
| Leased test device's app container | Independent writable scenario database/assets; handoff required before another workspace uses it |

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
