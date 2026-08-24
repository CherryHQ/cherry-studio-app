# Model Picker

This module owns the model selection surface, the model search adapter, model metadata UI, and model
setting helpers.

## Public Interface

- `ModelPickerDrawer` is the only model-selection view. Chat, painting, provider connectivity
  checks, model settings, and assistant editing all open this bottom sheet. Its header search button
  opens app search; the sheet itself remains a model catalog, not a search page.
- `ModelPickerList` renders the grouped selectable model rows inside that sheet. A long visible
  model list adds a right-side fast scroller with one distinct marker per provider. Provider markers
  jump to their group headers without changing provider/order-key order.
- `useModelSearch` supplies the app-level search route with the selectable model catalog and returns
  one selected model or cancellation. Its request supplies the shared search view's model-type
  filter while callers retain every business action.
- `ModelPickerIcon` and `ModelPickerTagChip` render model metadata used by picker consumers.
- `ModelTypeFilterBar` renders the model-type control, and `ModelTypeSearchFilter` adapts static
  model counts to app search's controlled filter contract.
- `useModelSettingSelections` reads and updates model selection preferences.
- Model setting and model type helpers are exported from `index.ts`.

## Organization

- `components/` contains the model selection sheet, metadata, and filtering UI.
- `hooks/` owns the app-search adapter and preference-backed model selection state.
- `utils/` contains pure model setting and model type helpers and tests.
