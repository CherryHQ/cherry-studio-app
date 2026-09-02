# Settings

This feature owns the settings home plus general app preferences that do not belong to a dedicated
service domain.

## Public Interface

- Route screen components are exported from `index.ts`.
- Reusable model selection lives in `src/frontend/components/modelPicker`; settings screens consume
  that module instead of owning it.
- The shared settings page shell, service row, and option type live in
  `src/frontend/components/settings` because provider, MCP, web search, and general settings all
  consume them.
- Generic rows, selectors, pickers, chips, buttons, and selection marks come from CherryUI. Provider,
  model, profile, and Agent visual identity comes from `src/frontend/components/avatar`.

## Organization

- `components/` contains settings-private controls such as the theme preview.
- `hooks/` contains shared settings preference hooks.
- `profileHero/` contains the static avatar and name entry shown at the top of the settings home.
- `PermissionsScreen/` owns system-permission presentation and status handling.

Provider, MCP, and web search settings are separate feature modules under `features/providers`,
`features/mcp`, and `features/webSearch` even though Expo Router presents them below `/settings`.
