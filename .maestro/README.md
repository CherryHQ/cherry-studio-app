# Maestro End-to-End Flows

These flows are the first deterministic end-to-end checks for Cherry Studio Mobile. They use
accessibility identifiers rather than translated labels and run independently from a fresh app
state.

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
characters. For a newly installed development client, include Expo's `disableOnboarding=1` query
parameter so its own launcher onboarding does not hide the product onboarding under test.

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

Run one flow by passing its file path instead of the directory. Both current flows clear application
state, then reconnect the development client through `DEV_CLIENT_URL`. They delete data in the
selected test installation and must never target a primary user installation. On the resident
device they also discard configuration other tasks reuse; prefer a temporary device for them.

## Scope

- `_skip-onboarding.yaml` is the shared helper subflow advancing fresh multi-step onboarding to the
  chat composer.
- `onboarding-skip.yaml` verifies the fresh-install path from onboarding to the chat composer.
- `appearance-persistence.yaml` verifies selecting the dark theme and retaining that preference
  after a full app restart.
- `chat-mock-stream.yaml` verifies sending a prompt and receiving a deterministic offline streamed
  reply when Metro is started with `EXPO_PUBLIC_DEV_MOCK_PROVIDER=1` (strictly `__DEV__`-only).
  It exercises the local UI/streaming/persistence pipeline without external credentials; it does
  not prove live third-party provider credentials work.
