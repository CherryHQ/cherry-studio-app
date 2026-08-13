# Model Picker

This module owns reusable model selection state, model picker sheet UI, and model setting helpers.

## Public Interface

- `ModelPickerBottomSheet` renders the reusable model picker bottom sheet.
- `ModelPickerList` renders the selectable model list, for the sheet and for the
  model settings' pushed picker screen alike.
- `ModelPickerIcon` and `ModelPickerTagChip` render model metadata used by picker consumers.
- `useModelSettingSelections` reads and updates model selection preferences.
- Model setting constants and helpers are exported from `index.ts`.

## Organization

- `components/` contains reusable model picker UI.
- `hooks/` owns preference-backed model selection state.
- `utils/` contains pure model setting helpers and tests.
