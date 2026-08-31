# Model Picker

This module owns the model selection surface, model metadata UI, and model setting helpers.

## Public Interface

- `ModelPickerDrawer` is the only model-selection view. Agent editing, painting, provider
  connectivity checks, and model settings all open this bottom sheet. Its search field filters the
  grouped model catalog in place without leaving the sheet.
- `ModelPickerList` renders the grouped selectable model rows inside that sheet. A long visible
  model list adds a right-side fast scroller with one distinct marker per provider. Provider markers
  jump to their group headers without changing provider/order-key order.
- `ModelPickerIcon` renders model identity used by picker consumers.
- `ModelSearchControls` keeps persistent workflow search native in the iOS header and inline on
  Android. Product workflows own their purpose controls rather than exposing provider capability
  taxonomies through the shared picker.
- `useModelSettingSelections` reads model selection preferences and exposes an explicit batch-save
  operation for the settings screen's draft.
- Model setting and model type helpers are exported from `index.ts`.

## Organization

- `components/` contains the model selection sheet, metadata, and filtering UI.
- `hooks/` owns model picker data and preference-backed model selection state.
- `utils/` contains pure model setting and model type helpers and tests.
