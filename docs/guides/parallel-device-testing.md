# Parallel Device Testing

This guide is the repository's execution standard for coding-agent device acceptance in local
Conductor workspaces. It covers configuration preparation, development-client reuse, iOS simulator
and Android emulator isolation, Metro sessions, and cleanup. Physical devices are outside this
workflow. [Testing And CI](./testing-and-ci.md) owns test selection and repository gates.

Apply the user's active authorization before execution. Designing this workflow does not authorize
builds, device creation/startup, tests, or model/tool calls. Follow authorization already given for
the task without asking again; this standard does not enable automatic acceptance after every edit.

## Self-Test Preparation

> Status: design
>
> The following preparation contract is accepted. Configuration export/import, source registration,
> native-artifact compatibility checks, shared caches, and their orchestration are not implemented.
> The device/session workflow later in this guide already exists.

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

Share immutable native development artifacts, not writable devices or databases. Each workspace
installs a compatible artifact into its own device and loads its own JavaScript through Metro.
[Expo development builds](https://docs.expo.dev/develop/development-builds/use-development-builds/)
support this iteration without rebuilding until underlying native code changes.

| Condition | Action |
| --- | --- |
| Compatible client installed | Reuse it with the workspace's Metro |
| New device and matching cached artifact | Install that artifact without another native build |
| JS/TS UI, business logic, or copied configuration changed | Reuse compatible native code; update code or import data as needed |
| Native inputs changed | Recompute compatibility and use a matching artifact, or build within task authorization |
| Artifact missing or compatibility unproven | Report the prerequisite; do not silently build or install an arbitrary package |

The artifact manifest identifies app ID, platform, simulator/emulator target, architecture,
development profile, native-input fingerprint, and artifact checksum. iOS device and simulator
binaries are not interchangeable. Fingerprints cover resolved native dependencies, Expo/React Native
versions, relevant lockfile/patch inputs, evaluated native config, local config-plugin implementation,
native source, and relevant build environment; record fingerprint/toolchain versions. Branch names
and app versions alone cannot establish compatibility.

[Expo Fingerprint](https://docs.expo.dev/versions/latest/sdk/fingerprint/) is a candidate input
collector, not an integrated cache. Account for its config-plugin limitations. Coordinate concurrent
cache misses and publish only complete successful artifacts; do not weaken compatibility checks to
obtain a cache hit. Record native compilation separately from internal package compilation.

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

## Workspace Resources

Conductor assigns each workspace ten ports: `$CONDUCTOR_PORT` through
`$((CONDUCTOR_PORT + 9))`. Use the base port for Metro and only that reserved range for companion
services. A Conductor device test must not use a fixed port such as `8081` or `8084`.

Each worktree uses a dedicated simulator named:

```text
iPhone 17 Pro ($CONDUCTOR_WORKSPACE_NAME)
```

Provision it lazily for the workspace, record its UDID under that workspace's `.context`, and never
reuse a simulator with a live ownership claim. If the dedicated simulator cannot be provisioned,
stop and report the blocker rather than taking another workspace's device.

Before opening the app, inspect devices and ownership:

```bash
agent-device devices --platform ios
agent-device device status --platform ios
```

Each worktree also uses a dedicated Android emulator named:

```text
CherryStudio API 36 ($CONDUCTOR_WORKSPACE_NAME)
```

Provision it lazily for the workspace and never substitute a physical device or another
workspace's emulator. Record the provisioner's stable AVD identity and expected workspace-specific
name under that workspace's `.context` when provisioning succeeds. After the emulator boots, also
record its current serial and `kind: emulator`. An Android serial such as `emulator-5554` can change
across boots, so refresh the runtime identity before each app session while retaining the stable
AVD identity. If the dedicated emulator cannot be provisioned, stop and report the blocker.

Before opening the Android app, inspect devices and active sessions:

```bash
agent-device devices --platform android
agent-device session list
```

## Metro And App Session

Keep Metro running across ordinary iterations and preserve its cache. `dev:clear` is for explicit
cache troubleshooting, not the default self-test startup. Local Conductor run settings should use
normal startup; setup scripts must not automatically build or boot a device. Both `dev` and
`dev:clear` currently run `packages:build` first, so starting them requires applicable build
authorization and must not be described as compilation-free.

Start Metro on the allocated base port:

```bash
pnpm dev --port "$CONDUCTOR_PORT"
```

Use a workspace-unique session, explicit simulator, and explicit Metro hint:

```bash
agent-device open com.cherry-ai.cherry-studio-app.dev --session "$CONDUCTOR_WORKSPACE_NAME" --platform ios --device "iPhone 17 Pro ($CONDUCTOR_WORKSPACE_NAME)" --metro-host 127.0.0.1 --metro-port "$CONDUCTOR_PORT" --relaunch
```

For Android, relaunch the installed development client on the dedicated emulator, then open the
exact development-client URL printed by this workspace's Metro process. Do not derive or reuse a
URL from another workspace. Opening that URL through `agent-device` configures Android-to-host
reachability for its Metro port.

```bash
agent-device open com.cherry_ai.cherry_studio_app.dev --session "${CONDUCTOR_WORKSPACE_NAME}-android" --platform android --serial "$ANDROID_SERIAL" --relaunch
agent-device open "$DEV_CLIENT_URL" --session "${CONDUCTOR_WORKSPACE_NAME}-android" --platform android --serial "$ANDROID_SERIAL"
```

Keep commands for one session serial. Different sessions may run concurrently only when their
devices and port ranges differ.

## Persistence Failures After Fast Refresh

Fast Refresh and a Metro reload do not restart the native app process. During development, an old
Expo SQLite connection can occasionally survive a refresh even though the current `DbService`
connection reports no active transaction. The same app process may then hold two sets of
`cherry.db` and WAL file descriptors, and SQLite-backed actions such as saving a preference fail at
`BEGIN IMMEDIATE` with `SQLiteErrorException: database is locked`.

Before changing UI or persistence code in response to this failure:

1. Capture the app log and confirm that the failure occurs at `BEGIN IMMEDIATE`.
2. Fully relaunch the app with the workspace-specific `agent-device open ... --relaunch` command
   above. A Metro reload is not a valid control experiment for this failure.
3. Repeat the exact save action. If it succeeds, classify the failure as a stale development
   runtime connection and remove any temporary diagnostic logging before committing.
4. If it still fails after the full relaunch, investigate transaction ownership and competing
   processes. `lsof` on `cherry.db`, `cherry.db-wal`, and `cherry.db-shm` can distinguish duplicate
   handles in the app process from an external lock holder.

Always perform persistence acceptance from a fully relaunched app after using Fast Refresh. Do not
delete the simulator database to clear this symptom; that destroys the state needed to reproduce a
real transaction-lifecycle bug.

## Cleanup

After a PR or complete stack is created:

1. Close the workspace session with `agent-device close --session "$CONDUCTOR_WORKSPACE_NAME"
   --platform ios --shutdown`.
2. Stop listeners only in `$CONDUCTOR_PORT..$((CONDUCTOR_PORT + 9))`.
3. Delete only the simulator whose recorded UDID and expected workspace name both match.
4. Remove the workspace simulator metadata after deletion succeeds or the recorded device is
   already absent.

Clean up Android with the same ownership guarantees:

1. Resolve the recorded stable AVD identity through its provisioner and verify the expected
   workspace-specific name. If running, also confirm the current serial resolves to that same AVD
   with `kind: emulator`; never trust a serial that now belongs to a different device.
2. For a running owned emulator, close the workspace session with `agent-device close --session
   "${CONDUCTOR_WORKSPACE_NAME}-android" --platform android --shutdown`.
3. Delete only the recorded AVD whose stable identity and expected name both match, using the same
   provisioner that created it. A stopped emulator can be deleted without booting it. Never delete
   an Android device by serial alone or guess an AVD identity from incomplete ownership metadata.
4. Remove the workspace emulator metadata after the provisioner confirms that the recorded AVD is
   absent. A missing runtime serial does not prove the AVD was deleted; retain the stable ownership
   record across shutdown or interrupted cleanup.

The repository does not provide a Conductor archive hook that guarantees this cleanup. Perform the
steps above explicitly; do not assume archiving a workspace releases its devices and processes.
A locally configured archive hook may repeat the same cleanup as a fallback. That configuration
belongs to the local environment, not to this guide's current-state guarantees.

All cleanup paths must be idempotent and refuse to delete unrecorded or name-mismatched devices.
Android cleanup must also refuse to delete a physical device or an AVD with mismatched identity.
