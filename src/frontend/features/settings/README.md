# Settings

This module owns settings screens' shared UI and feature-specific settings modules.

## Public Interface

- Route screen components are exported from `index.ts`.
- Feature settings modules expose their own `index.ts` files under `ProviderScreen/` and
  `WebSearchScreen/`.
- Reusable model selection lives in `src/frontend/components/modelPicker`; settings screens consume
  that module instead of owning it.
- Generic rows, selectors, pickers, chips, buttons, and selection marks come from CherryUI. Provider,
  model, profile, and Agent visual identity comes from `src/frontend/components/avatar`.

## Organization

- `components/` contains settings-private adapters and layouts: the scroll-page shell, provider/MCP
  service row, numeric preference input, theme preview, and the provider-avatar persistence adapter.
  These remain local because they own settings navigation, storage, or high-density list behavior;
  they compose the public controls instead of duplicating them.
- `hooks/` contains shared settings preference hooks.
- `profileHero/` contains the static avatar and name entry shown at the top of the settings home.
- `ProviderScreen/` and `WebSearchScreen/` contain feature-specific settings modules.
