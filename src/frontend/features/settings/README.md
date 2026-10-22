# Settings

This page tree owns the settings home and every page reached beneath `/settings`.

## Public Interface

- Each route imports the public boundary of its exact child page.
- Reusable model selection lives in `src/frontend/components/ModelPicker`; settings screens consume
  that module instead of owning it.
- The page shell shared by settings child pages lives in `components/SettingsScrollPage`.
- Provider pages use the settings-local row from `components/SettingsServiceRow`.
- The option shape shared by settings child pages lives in `settingOption.ts`.
- Generic rows, selectors, pickers, chips, buttons, and selection marks come from CherryUI. Provider,
  model, profile, and Agent visual identity comes from `src/frontend/components/Avatar`.

## Organization

- `components/` contains UI private to the settings home.
- About renders its ordinary "check for updates" row from the shared
  [app-update entry](../../appShell/appUpdate/README.md); the update dialog, discovery, reminders,
  download state and channel actions belong to app-shell/backend infrastructure.
- `hooks/` and `utils/` contain behavior shared by settings child pages.
- `about/`, `appearance/`, `fontSize/`, `notifications/`, `permissions/`, and `profile/` each own one
  direct child page.
- `appearance/` is presented as General settings and owns theme, app language, font size, Share
  watermark, and document parser settings. It retains the existing `/settings/appearance` route.
- `model/` and `provider/` remain under `settings/` because they implement `/settings/*` page flows.
  Their own nested routes continue as child directories.
