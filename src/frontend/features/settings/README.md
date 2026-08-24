# Settings

This module owns settings screens' shared UI and feature-specific settings modules.

## Public Interface

- Route screen components are exported from `index.ts`.
- Feature settings modules expose their own `index.ts` files under `ProviderScreen/` and
  `WebSearchScreen/`.
- Reusable model selection lives in `src/frontend/components/modelPicker`; settings screens consume that
  module instead of owning it.

## Organization

- `components/` contains settings-private row, section, select, input, and service-row UI shared by
  nested settings areas through relative imports.
- `hooks/` contains shared settings preference hooks.
- `profileHero/` contains the static avatar and name entry shown at the top of the settings home.
- `ProviderScreen/` and `WebSearchScreen/` contain feature-specific settings modules.
