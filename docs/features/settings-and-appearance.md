# Settings And Appearance

Settings hub controlling appearance (light/dark/system theme), language, chat display toggles,
AI usage, voice, data management, privacy, and diagnostics.

## User Entry

- Open the sidebar using `testID:main-header-open-sidebar` or the native iOS menu button’s
  accessibility label. Tap `testID:sidebar-settings`.
- Settings sections:
  - General & Appearance (`testID:settings-general`): theme selector (`testID:theme-preview-section-item`,
    `testID:theme-preview-dark`), language picker (`testID:language-picker`), watermark
    (`testID:settings-export-watermark`), keep screen on (`testID:settings-keep-screen-on`),
    chat toggles (`testID:settings-multi-model-cards`, `testID:settings-auto-collapse-process`,
    `testID:settings-session-branch-tree`, `testID:settings-enter-to-send`).
  - Other top-level entries: `testID:settings-ai-usage`, `testID:settings-voice`,
    `testID:settings-data`, and privacy shake-to-feedback (`testID:settings-shake-feedback`).

## Verification Driver

- Deterministic Maestro flow (theme selection + full app restart persistence):
  - `.maestro/flows/appearance-persistence.yaml`
  - Run via `pnpm verify:device run --flow .maestro/flows/appearance-persistence.yaml --platform ios --device <UDID> --dev-client-url "<DEV_CLIENT_URL>"`
- i18n resource contract check: `pnpm i18n:check` and design contract check: `pnpm design:check`.

## Observable Acceptance

- Selecting `testID:theme-preview-dark` marks it checked before and after a full app relaunch.
  Maestro reads the native accessibility value on iOS and the checked attribute on Android.
- Switching language in `testID:language-picker` updates UI copy consistently across screens using
  the shared `resolveAppLanguage` resolver.

## Known Pitfalls

- `.maestro/flows/appearance-persistence.yaml` runs `clearState`; run it on a temporary workspace
  device rather than the shared resident device.
- Always verify preference persistence after a full app relaunch (`--relaunch` or `stopApp` followed by reopening
  `DEV_CLIENT_URL`), never only after Fast Refresh, to avoid stale SQLite WAL handle false positives.
