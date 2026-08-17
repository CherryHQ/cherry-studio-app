# Model Picker

This module owns reusable model selection state, model picker UI, and model setting helpers.

## Public Interface

- `ModelPickerBottomSheet` renders the reusable model picker bottom sheet.
- `ModelPickerScreen` renders the pushed model picker screen — search, model type tabs and the
  grouped list — for every caller that picks a model on a screen of its own.
- `ModelPickerList` renders the selectable model list, for the sheet and for the pushed screen alike.
- `ModelPickerIcon` and `ModelPickerTagChip` render model metadata used by picker consumers.
- `ModelSearchControls`, `ModelSearchField` and `ModelTypeFilterBar` render the search and model
  type chrome shared by the picker screen and the provider model screens.
- `useModelSettingSelections` reads and updates model selection preferences.
- Model setting and model type helpers are exported from `index.ts`.

## Organization

- `components/` contains reusable model picker UI.
- `hooks/` owns preference-backed model selection state.
- `utils/` contains pure model setting and model type helpers and tests.
