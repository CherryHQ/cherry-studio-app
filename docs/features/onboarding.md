# Onboarding

First-run setup guiding a fresh installation from welcome through account sign-in, model source
selection, notification permission, and device permissions into the main chat composer.

## User Entry

- Fresh installation (or cleared simulator app state) launches directly into welcome (`testID:onboarding-welcome`, start button `testID:onboarding-start`) and privacy consent (`testID:onboarding-privacy`, analytics toggle `testID:onboarding-analytics`, continue `testID:onboarding-privacy-continue`).
- Subsequent setup steps:
  - Account step (`testID:onboarding-account`): `testID:onboarding-sign-in`, `testID:onboarding-private-login`, or `testID:onboarding-skip-login`.
  - Model source step (`testID:onboarding-model-source`): `testID:onboarding-connect`, `testID:onboarding-desktop-sync`, or `testID:onboarding-model-source-skip`.
  - Notifications step (`testID:onboarding-notifications-continue` / `testID:onboarding-notifications-skip`).
  - Permissions step (`testID:onboarding-permissions` -> `testID:onboarding-permissions-continue`).

## Verification Driver

- Deterministic Maestro flow (fresh install path; see Known Pitfalls regarding drifted selectors):
  - `.maestro/flows/onboarding-skip.yaml`
  - Run via `pnpm verify:device run --flow .maestro/flows/onboarding-skip.yaml --platform ios --device <UDID> --dev-client-url "<DEV_CLIENT_URL>"`
- Interactive multi-step check: `agent-device` on a temporary device (never clear state on the
  resident test device without explicit authorization).

## Observable Acceptance

- Welcome screen renders `testID:onboarding-welcome` without Expo dev-client launcher blocking it
  (pass `disableOnboarding=1` on fresh dev-client URLs).
- Completing or skipping onboarding lands on chat with `testID:chat-composer` and
  `testID:chat-composer-send` visible and interactive.
- Completing sign-in or skipping model/notification steps advances cleanly without looping back to
  completed steps, and full app relaunch opens directly into chat.

## Known Pitfalls

- `.maestro/flows/onboarding-skip.yaml` still references legacy `onboarding-skip` and
  `chat-composer-input` IDs from an earlier onboarding layout and needs device-verified updating to
  the current multi-step IDs (`testID:onboarding-start` / `testID:onboarding-skip-login` /
  `testID:chat-composer`).
- `.maestro/flows/onboarding-skip.yaml` executes `clearState`; run it on a temporary workspace
  device so shared resident-device configuration is preserved.
- OS notification/permission alerts are native system sheets outside React Native's view hierarchy;
  verify advancing past the notification step both when granted and when skipped/denied.
- Persistence of `app.onboarding.status = completed` must be verified after a full app relaunch,
  not Fast Refresh.
