# Parallel Device Testing

This guide defines iOS simulator and Metro isolation for concurrent Conductor worktrees. Android
emulator provisioning is outside this workflow.

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

## Metro And App Session

Start Metro on the allocated base port:

```bash
pnpm dev --port "$CONDUCTOR_PORT"
```

Use a workspace-unique session, explicit simulator, and explicit Metro hint:

```bash
agent-device open com.cherry-ai.cherry-studio-app --session "$CONDUCTOR_WORKSPACE_NAME" --platform ios --device "iPhone 17 Pro ($CONDUCTOR_WORKSPACE_NAME)" --metro-host 127.0.0.1 --metro-port "$CONDUCTOR_PORT" --relaunch
```

Keep commands for one session serial. Different sessions may run concurrently only when their
devices and port ranges differ.

## Cleanup

After a PR or complete stack is created:

1. Close the workspace session with `agent-device close --session "$CONDUCTOR_WORKSPACE_NAME"
   --platform ios --shutdown`.
2. Stop listeners only in `$CONDUCTOR_PORT..$((CONDUCTOR_PORT + 9))`.
3. Delete only the simulator whose recorded UDID and expected workspace name both match.
4. Remove the workspace simulator metadata after deletion succeeds or the recorded device is
   already absent.

The local Conductor archive script repeats this cleanup as a fallback. Cleanup must be idempotent and
must refuse to delete an unrecorded or name-mismatched simulator.
