# Settings

This page tree owns the settings home and every page reached beneath `/settings`.

## Public Interface

- Each route imports the public boundary of its exact child page.
- Reusable model selection lives in `src/frontend/components/ModelPicker`; settings screens consume
  that module instead of owning it.
- The page shell shared by settings child pages lives in `components/SettingsScrollPage`.
- Provider and MCP share the settings-local row from `components/SettingsServiceRow`.
- The option shape shared by settings child pages lives in `settingOption.ts`.
- Generic rows, selectors, pickers, chips, buttons, and selection marks come from CherryUI. Provider,
  model, profile, and Agent visual identity comes from `src/frontend/components/Avatar`.

## Organization

- `components/` contains UI private to the settings home.
- `hooks/` and `utils/` contain behavior shared by settings child pages.
- `about/`, `appearance/`, `fontSize/`, `notifications/`, `permissions/`, and `profile/` each own one
  direct child page.
- `model/`, `mcp/`, `provider/`, and `webSearch/` remain under `settings/` because they implement
  `/settings/*` page flows. Their own nested routes continue as child directories.
