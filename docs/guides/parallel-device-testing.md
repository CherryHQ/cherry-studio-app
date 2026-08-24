# Parallel Device Testing

This guide defines iOS simulator, Android emulator, and Metro isolation for concurrent Conductor
worktrees. Physical devices are outside this workflow.

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
workspace's emulator. After the emulator boots, record its expected name, current serial, and
`kind: emulator` under that workspace's `.context`. An Android serial such as `emulator-5554` can
change across boots, so refresh the ownership record before each app session. If the dedicated
emulator cannot be provisioned, stop and report the blocker.

Before opening the Android app, inspect devices and active sessions:

```bash
agent-device devices --platform android
agent-device session list
```

## Metro And App Session

Start Metro on the allocated base port:

```bash
pnpm dev --port "$CONDUCTOR_PORT"
```

Use a workspace-unique session, explicit simulator, and explicit Metro hint:

```bash
agent-device open com.cherry-ai.cherry-studio-app --session "$CONDUCTOR_WORKSPACE_NAME" --platform ios --device "iPhone 17 Pro ($CONDUCTOR_WORKSPACE_NAME)" --metro-host 127.0.0.1 --metro-port "$CONDUCTOR_PORT" --relaunch
```

For Android, relaunch the installed development client on the dedicated emulator, then open the
exact development-client URL printed by this workspace's Metro process. Do not derive or reuse a
URL from another workspace. Opening that URL through `agent-device` configures Android-to-host
reachability for its Metro port.

```bash
agent-device open com.cherry_ai.cherry_studio_app --session "${CONDUCTOR_WORKSPACE_NAME}-android" --platform android --serial "$ANDROID_SERIAL" --relaunch
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

1. Reinspect Android devices and confirm the recorded serial still resolves to the expected
   workspace-specific name and `kind: emulator`.
2. Close the workspace session with `agent-device close --session
   "${CONDUCTOR_WORKSPACE_NAME}-android" --platform android --shutdown`.
3. Delete only the AVD whose recorded serial and expected workspace-specific name both match, using
   the same provisioner that created it. Never delete an Android device by serial alone.
4. Remove the workspace emulator metadata after deletion succeeds or the recorded device is
   already absent.

The local Conductor archive script repeats this cleanup as a fallback. Cleanup must be idempotent and
must refuse to delete an unrecorded or name-mismatched simulator.

The same fallback and idempotency requirements apply to Android cleanup, which must also refuse to
delete a physical device.
