# Parallel Device Testing

This guide is the repository's execution standard for coding-agent device acceptance in local
Conductor workspaces. It covers configuration preparation, shared iOS simulators and Android emulators,
development-client reuse, Metro sessions, and cleanup. Physical devices are outside this
workflow. [Testing And CI](./testing-and-ci.md) owns test selection and repository gates.

Apply the user's active authorization before execution. Designing this workflow does not authorize
builds, device creation/startup, tests, or model/tool calls. Follow authorization already given for
the task without asking again; this standard does not enable automatic acceptance after every edit.

## Self-Test Preparation

> Status: design
>
> The following preparation contract is accepted. Configuration export/import and source
> registration are not implemented. The device, development-client and session workflow later in
> this guide already exists.

An ordinary configured self-test reuses a compatible development client, copies the primary
environment's user configuration into an independent workspace database, and creates conversation
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
| `$CONDUCTOR_ROOT_PATH/.local/agent-self-testing/` | Source registration, immutable configuration snapshots, and compatible development artifacts shared by this repository's workspaces |
| Workspace `.context/agent-self-testing/` | Preparation receipt, scenario evidence, timing, and temporary transfers |
| Workspace device's app container | Independent writable database, configuration assets, and locally created scenario content |

Snapshots intentionally contain credentials. Keep them and temporary backups private to the local
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

Successful preparation pins the snapshot identity. Re-running preparation validates the device,
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

### Development Client Reuse

Development clients are shared through the fingerprint-named artifacts in
[Development Client](#development-client); only native input changes require a new build.

### Coding Agent Procedure And Evidence

1. Identify behavior, platform, scenario baseline, dependencies, and existing authorization. Use
   [Testing And CI](./testing-and-ci.md) for code-level checks.
2. Resolve [workspace resources](#workspace-resources) and artifact compatibility; configured
   acceptance also resolves the primary source and snapshot. Reuse a valid preparation receipt.
3. Install only when required and import only for a new configured target or explicit refresh.
   Keep source data separate from all target mutation/cleanup paths.
4. Open the explicit [workspace session](#metro-and-app-session). Fully relaunch after import and
   before persistence acceptance following Fast Refresh.
5. Exercise the requested behavior. Create only the local conversation, attachment, or fixture the
   scenario needs. Do not import primary conversation/file history to populate a screen. Missing
   configuration, invalid credentials, inaccessible services, or unsupported device capabilities
   block the dependent scenario; continue independent work where useful. Never silently substitute
   a model, mock provider, tool server, or shared device and claim the original scenario passed.
6. Report preparation separately from scenario results. An app opening proves neither valid
   credentials nor a successful model/tool call. For actual calls, record Agent/model/MCP identities
   and observed outcomes. Importing credentials does not authorize external tool actions or bypass
   product approval behavior; do not require an extra real call for a UI-only scenario.
7. Retain device/data for continued workspace work. At the cleanup point in
   [Git Workflow](./git-workflow.md), follow [Cleanup](#cleanup), remove temporary secret-bearing
   workspace transfers, and preserve the primary source and shared repository cache.

Receipts record baseline, workspace/device/app identity, artifact identity, snapshot/import version
when applicable, target schema, Metro port, and reuse decisions. Evidence records expected versus
observed behavior, omissions/blockers, and durations for startup, build/install, import, Metro
readiness, and scenario execution. Never log secret values or claim unmeasured timing guarantees.

### Implementation Boundaries And Acceptance

Host orchestration belongs under `scripts`; format validation and import belong to the backend data
owner, with image handling delegated to existing profile, Agent, and provider image owners. Keep any
runtime import entry development-only and separate from normal startup/seeding and product Data API
routes. This workflow does not introduce a shared production database or a general remote backend.

Before marking preparation implemented, demonstrate these outcomes with authorized checks:

- Fresh configured target: six configuration domains and required assets restored; relationships
  resolve; excluded content is empty.
- Repeated/concurrent preparation: no duplicate imports, content resets, unnecessary native builds,
  cache clearing, or cross-workspace writes.
- Refresh: source changes stay pinned until requested; local conflicts are reported; failure leaves
  existing target data usable.
- Interruption/schema mismatch: no partial import or source mutation; recovery is repeatable.
- Native changes: incompatible artifacts rejected and build authorization respected.
- Missing prerequisites and first-run scenarios: outcomes and chosen baselines reported accurately.
- Cleanup/retry: only owned resources removed; primary source and shared inputs preserved.

These are future implementation acceptance criteria, not evidence that checks have run. Update the
status as capabilities land. No preparation command or machine-local setting is installed by this
design.

## Agent Device Workflow

Use `agent-device >= 0.21.27` and read `agent-device help workflow` before planning commands.
Use `help batch`, `help scripting`, or `help debugging` for the relevant operation. The installed
CLI owns command syntax; keep the upstream skill unchanged. The CLI is a machine tool, not an app
dependency.

Give each workspace its own daemon state directory:

```bash
export AGENT_DEVICE_STATE_DIR="$PWD/.context/agent-device"
```

Repeat this export in every new shell, or pass `--state-dir "$PWD/.context/agent-device"` on every
command. This isolates daemon versions and session logs while host-global device claims still
prevent two workspaces from controlling the same device. `session list` only lists sessions in the
selected state directory. If an upgrade reports `daemon_registration_unproven` in the old global
directory, use the workspace directory; do not delete its locks or stop another workspace's daemon.

### Observe, Act, And Verify

- Read `snapshot -i` when discovering controls. Prefer stable `testID`/id selectors for known
  controls; use refs only from the current snapshot. After a mutation, a known selector can resolve
  the next control without another full snapshot.
- Use `press`/`fill`/`back --settle` when the next step needs the settled UI. Reuse the returned diff
  as the next observation. `--settle` is best-effort: an unsettled result needs a bounded wait or
  another snapshot. It does not prove that a delayed request succeeded.
- Wait for the exact expected text or selector for asynchronous results. Avoid fixed sleeps and
  repeated snapshot polling. Do not add `wait stable` after a settled diff already shows the result.
- Answer narrow questions with `get`, `is`, or `find`; use scoped snapshots for a particular
  container. Scope/depth and compact text reduce output, not a guaranteed native capture cost.
- Take screenshots for visual assertions or failure evidence, not after every ordinary tap. Use
  JSON/raw output only when structured diagnostics or geometry are required.

### Known Sequences

Write a short scenario-specific batch under `.context/agent-self-testing/`, using the structured
`command`/`input` shape from `help batch`:

```bash
agent-device batch --steps-file .context/agent-self-testing/steps.json --on-error stop --session "$CONDUCTOR_WORKSPACE_NAME" --platform ios
```

Batch only steps whose targets and intermediate states are already known. Use stable selectors,
not refs carried across mutations, and stop at the first error. Split at an unknown screen,
ambiguous target, permission prompt, or external result that needs a new decision. Verify the exact
scenario outcome with a targeted wait/read; successful dispatch or a quiet screen is insufficient.
Keep commands serial within one session, including batch steps.

For a known destination, prefer its targeted wait over settling every mutation. A selector wait's
input uses `kind: "selector"` with `selector`; a strict absence wait uses `kind: "absent"` with
`absent`, not `selector`. A round trip should verify the destination before returning, then verify
its disappearance and the original screen's landmark so retained navigation views cannot falsely
satisfy the final check.

For a repeated route, `help scripting` describes recording an open-to-destination `.ad` script
with a selector guard and publishing it with `session save-script` without closing the session.
Store local scripts and evidence under `.context/agent-self-testing/`; parameterize credentials as
the scripting guide requires. In 0.21, batch files use `--steps-file` and structured `input`;
performance commands use explicit `perf frames`, `perf memory`, `perf cpu`, or `perf trace`, not
the retired `perf metrics` form.

When measuring an authorized run, separate device boot, first tool setup, app/Metro readiness,
warm reads/actions, and total scenario time. Session `events` supplies bounded command durations.
Measure app frames/memory separately when the symptom is rendering jank; command latency alone
does not establish app performance. Record failures and retries as well as successful timings.

## Workspace Resources

Conductor assigns each workspace ten ports: `$CONDUCTOR_PORT` through
`$((CONDUCTOR_PORT + 9))`. Use the base port for Metro and only that reserved range for companion
services. A Conductor device test must not use a fixed port such as `8081` or `8084`.

### Resident And Temporary Devices

Each platform has one resident test device that every workspace reuses:

| Platform | Resident device | Temporary device |
| --- | --- | --- |
| iOS | Simulator `Cherry Test` | `Cherry Temp ($CONDUCTOR_WORKSPACE_NAME)` |
| Android | AVD `Cherry_Test` | `Cherry_Temp_$CONDUCTOR_WORKSPACE_NAME` |

The resident device keeps its app data and configuration across tasks and is never deleted. If it
does not exist, report it; create it only with device-creation authorization. Never use a physical
device or the user's primary installation.

Before using the resident device, inspect host-global ownership and this workspace's sessions:

```bash
agent-device device status --platform ios --udid "<resident UDID>" --json
agent-device session list --json
```

On Android use `device status --platform android --serial "<resident serial>"`.

- No other owner: use session `$CONDUCTOR_WORKSPACE_NAME` (iOS) or
  `${CONDUCTOR_WORKSPACE_NAME}-android`. Reuse an already-bound workspace session.
- A provably stale claim is reclaimed automatically by `open`. Do not infer that a live owner is
  abandoned from a request-directory timestamp or close another workspace's session.
- A live or uncertain owner blocks reuse. With device-creation/startup authorization, create this
  workspace's temporary device with the resident device's device type (iOS) or system image
  (Android, `image.sysdir.1` in the resident AVD's `config.ini`); otherwise report the occupied device:

```bash
xcrun simctl create "Cherry Temp ($CONDUCTOR_WORKSPACE_NAME)" "<resident device type>"
avdmanager create avd -n "Cherry_Temp_$CONDUCTOR_WORKSPACE_NAME" -k "<system-images;...>"
```

A temporary device starts with empty app data. Reuse it for the rest of the task, and delete it at
[cleanup](#cleanup). Leave other devices, including unrecognized ones, untouched.

### Development Client

Reuse an installed development client until native inputs change. The native fingerprint decides
compatibility:

```bash
PROFILE=development pnpm exec fingerprint fingerprint:generate --platform ios | jq -r .hash
```

Shared artifacts live in `$CONDUCTOR_ROOT_PATH/.local/dev-clients/` as `ios-<hash>.tar.gz` or
`android-<hash>.apk`. Install the one matching this workspace's hash; reinstalling keeps app data.
If none matches, report it, or with build authorization build it straight to that path:

```bash
pnpm build:local --platform ios --profile development-simulator --output "$CONDUCTOR_ROOT_PATH/.local/dev-clients/ios-<hash>.tar.gz"
pnpm build:local --platform android --output "$CONDUCTOR_ROOT_PATH/.local/dev-clients/android-<hash>.apk"
```

Extract the iOS archive and install its `.app` with `agent-device install`. iOS simulator and
physical-device builds are not interchangeable.

## Metro And App Session

Keep the selected device, workspace session, and Metro running across consecutive authorized
scenarios and ordinary code/test iterations in the same active task. Reuse the installed client and
preserve Metro's cache. `dev:clear` is for explicit cache troubleshooting, not default startup.
Conductor's Run script starts Metro on the base port; otherwise start it yourself:

```bash
pnpm dev --port "$CONDUCTOR_PORT"
```

On the first attachment, open the development client on the selected device, then the exact
development-client URL printed by this workspace's Metro process. Do not derive or reuse a URL from
another workspace. A normal `open` foregrounds an already-running app without restarting it:

```bash
agent-device open com.cherryai.cherrystudio-app.dev --session "$CONDUCTOR_WORKSPACE_NAME" --platform ios --device "<selected device>"
agent-device open "$DEV_CLIENT_URL" --session "$CONDUCTOR_WORKSPACE_NAME" --platform ios --device "<selected device>"
```

On Android use `com.cherryai.cherrystudio_app.dev`, session `${CONDUCTOR_WORKSPACE_NAME}-android` and
`--serial` of the running emulator. Keep commands for one session serial.

Once the correct app and workspace URL are bound, continue in that session without repeating
`open`, installation, or Metro startup. Use `--relaunch` after import/install, for native/startup
scenarios, before persistence acceptance after Fast Refresh, or to investigate a stale runtime;
ordinary navigation and JS-only visual iterations do not require it.

The resident device's data may have been left by another workspace's branch, including a newer
database schema. Uninstall and reinstall the development client only when the scenario needs empty
data; tell the user when that discards configuration they set up.

## Persistence Failures After Fast Refresh

Fast Refresh and a Metro reload do not restart the native app process. During development, an old
Expo SQLite connection can occasionally survive a refresh even though the current `DbService`
connection reports no active transaction. The same app process may then hold two sets of
`cherry.db` and WAL file descriptors, and SQLite-backed actions such as saving a preference fail at
`BEGIN IMMEDIATE` with `SQLiteErrorException: database is locked`.

Before changing UI or persistence code in response to this failure:

1. Capture the app log and confirm that the failure occurs at `BEGIN IMMEDIATE`.
2. Fully relaunch the app with `agent-device open com.cherryai.cherrystudio-app.dev --relaunch`
   and the same workspace/device flags (use the Android app id on Android), then reconnect to the
   workspace URL if needed. A Metro reload is not a valid control experiment for this failure.
3. Repeat the exact save action. If it succeeds, classify the failure as a stale development
   runtime connection and remove any temporary diagnostic logging before committing.
4. If it still fails after the full relaunch, investigate transaction ownership and competing
   processes. `lsof` on `cherry.db`, `cherry.db-wal`, and `cherry.db-shm` can distinguish duplicate
   handles in the app process from an external lock holder.

Always perform persistence acceptance from a fully relaunched app after using Fast Refresh. Do not
delete the simulator database to clear this symptom; that destroys the state needed to reproduce a
real transaction-lifecycle bug.

## Cleanup

Clean up when active task work ends, before waiting for review, or at PR creation. Do not clean up
between scenarios or code/test iterations while actively continuing the same authorized task:

1. Close the session and shut the device down:
   `agent-device close --session "$CONDUCTOR_WORKSPACE_NAME" --platform ios --shutdown` (Android:
   the `-android` session).
2. Stop the Metro process you started, if any; stop listeners only in this workspace's port range.
3. Delete this workspace's temporary device, if one was created:
   `xcrun simctl delete "Cherry Temp ($CONDUCTOR_WORKSPACE_NAME)"` or
   `avdmanager delete avd -n "Cherry_Temp_$CONDUCTOR_WORKSPACE_NAME"`.

Never delete the resident device. The repository `.conductor/settings.toml` repeats step 3 on
workspace archive as a fallback; machine-local Conductor settings can override it.
