# Model Picker

This module owns the model selection surface, model metadata UI, and model setting helpers.

## Public Interface

- `ModelPickerDrawer` is the only model-selection view. Agent editing, painting, provider
  connectivity checks, and model settings all open this bottom sheet. Its search field filters the
  grouped model catalog in place without leaving the sheet. Callers may supply `onAddProvider` so
  the unfiltered empty state can hand off to provider setup without coupling the picker to routing.
- `ModelPickerList` renders the grouped selectable model rows inside that sheet. A long visible
  model list adds a right-side fast scroller with one distinct marker per provider. Provider markers
  jump to their group headers without changing provider/order-key order.
- `ModelPickerIcon` renders model identity used by picker consumers.
- `ModelSearchControls` composes the shared controlled `InlineSearch`: native in the iOS header and
  embedded in the Android controls frame. The drawer's `chat` variant adds the two high-value
  model traits (`Free` and `Vision`) as row badges and a compact filter menu; other workflows keep
  the picker neutral rather than exposing the provider capability taxonomy.
- `useModelSettingSelections` reads model selection preferences and saves partial updates. The
  settings screen persists each selection immediately.
- Model setting and model type helpers are exported from `index.ts`.

## Organization

- `components/` contains the model selection sheet, metadata, and filtering UI.
- `hooks/` owns model picker data and preference-backed model selection state.
- `utils/` contains pure model setting and model type helpers and tests.
