# Model Picker

This module owns reusable model selection state, model picker sheet UI, and model setting helpers.

## Public Interface

- `ModelPickerSheetContent` renders the selectable model list.
- `useModelSettingSelections` reads and updates model selection preferences.
- Model setting constants and helpers are exported from `index.ts`.

## Organization

- `components/` contains reusable model picker UI.
- `hooks/` owns preference-backed model selection state.
- `utils/` contains pure model setting helpers and tests.
