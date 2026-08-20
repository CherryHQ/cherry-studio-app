# Provider Models

This module owns provider model list rendering and grouping behavior.

## Public Interface

- Model list leaf components and `useProviderModelGroups` are exported from `index.ts`.

## Organization

- `components/` contains provider model list UI pieces, including `ProviderModelSelectList` — the
  provider's own models drawn as a single-choice list for the connectivity check screen.
- `hooks/` owns displayed group state.
- `utils/` contains pure grouping and filtering helpers, and the check's selection resolvers.
