# Maestro End-to-End Flows

These flows are the first deterministic end-to-end checks for Cherry Studio Mobile. They use
stable accessibility identifiers where available and run independently from a fresh app state.
The native iOS toolbar action is selected by its English or Simplified Chinese accessibility label.

## Prerequisites

- Install a compatible development build on the target simulator or emulator.
- Start the workspace's Metro session and copy the exact development-client URL it prints.
- Install the Maestro CLI and select the intended device explicitly when more than one is running.

Follow [Parallel Device Testing](../docs/guides/parallel-device-testing.md) when running flows from a
Conductor workspace. Use the resident test device only when no other session is active on it;
otherwise use this workspace's temporary device.

## Run

Set `DEVICE_ID` to the selected simulator UDID or emulator serial. Set `DEV_CLIENT_URL` to the
exact URL printed by this workspace's Metro process; keep it quoted because it contains URL query
characters. On a fresh Expo SDK 58 development client, append
`&__expo_disable_onboarding=1&__expo_disable_fab=1&__expo_disable_auto_launch=1` to the printed URL
so the development client opens the app without its own onboarding or dev menu.

Use the platform's application identifier:

```bash
# iOS
maestro --device "$DEVICE_ID" test \
  -e APP_ID=com.cherryai.cherrystudio-app.dev \
  -e DEV_CLIENT_URL="$DEV_CLIENT_URL" \
  .maestro/flows

# Android
maestro --device "$DEVICE_ID" test \
  -e APP_ID=com.cherryai.cherrystudio_app.dev \
  -e DEV_CLIENT_URL="$DEV_CLIENT_URL" \
  .maestro/flows
```

The directory runs the two flows listed in `flows/config.yaml`. Run one flow by passing its file
path instead of the directory. Both suite flows clear application state, then reconnect the
development client through `DEV_CLIENT_URL`. They delete data in the
selected test installation and must never target a primary user installation. On the resident
device they also discard configuration other tasks reuse; prefer a temporary device for them.

## Scope

- `onboarding-skip.yaml` verifies the fresh-install path from onboarding to the chat composer.
- `appearance-persistence.yaml` verifies selecting the dark theme and retaining that preference
  after a full app restart.

A provider-backed chat flow is intentionally absent. It requires deterministic development-only
fixture preparation; the current seed data does not provide a mock provider, and a successful app
launch must not be treated as proof that credentials or external model calls work.
