# Model Picker

This module owns reusable model selection state, model picker sheet UI, and model setting helpers.

## Public Interface

- `ModelPickerBottomSheet` renders the reusable model picker bottom sheet.
- `ModelPickerSheetContent` renders the selectable model list inside the sheet.
- `ModelPickerIcon` and `ModelPickerTagChip` render model metadata used by picker consumers.
- `useModelSettingSelections` reads and updates model selection preferences.
- Model setting constants and helpers are exported from `index.ts`.

## Organization

- `components/` contains reusable model picker UI.
- `hooks/` owns preference-backed model selection state.
- `utils/` contains pure model setting helpers and tests.
