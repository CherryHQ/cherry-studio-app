# Settings

This module owns settings screens' shared UI and feature-specific settings modules.

## Public Interface

- Shared settings controls are exported from `index.ts`.
- Feature settings modules expose their own `index.ts` files under `provider/` and `webSearch/`.
- Reusable model selection lives in `src/components/modelPicker`; settings screens consume that
  module instead of owning it.

## Organization

- `components/` contains reusable settings row, section, select, input, and service-row UI.
- `hooks/` contains shared settings preference hooks.
- `provider/` and `webSearch/` contain feature-specific settings modules.
