# Model Picker

This module owns the model selection surface, model metadata UI, and model setting helpers.

## Public Interface

- `ModelPickerDrawer` is the only model-selection view. Agent editing, painting, provider
  connectivity checks, and model settings all open this bottom sheet. Its search field filters the
  grouped model catalog in place without leaving the sheet. Callers may supply `onAddProvider` so
  the unfiltered empty state can hand off to provider setup without coupling the picker to routing.
  Focusing search expands the sheet from `large` to `full`. Clearing search, dismissing the keyboard,
  and changing filters retain that height; a downward drag can return to `large` without discarding
  the current conditions. A filtered empty state offers one action to clear search and filters.
- `ModelPickerList` renders the grouped selectable model rows inside that sheet. A long visible
  model list adds a right-side fast scroller with one distinct marker per provider. Provider markers
  jump to their group headers without changing provider/order-key order. The contact-style index
  floats in a narrow capsule; holding or dragging it shows the targeted provider's name to its left
  until release or cancellation. The gesture target owns that preview independently of the
  scroll-driven current group; the preview does not intercept touches or open a menu. An immediate
  native press retains the touch while scrubbing the index, so the sheet's vertical pan cannot move
  the sheet underneath the finger. There is no hold delay or movement-distance cutoff.
  Model names stay on one line with middle truncation, retaining their identifying prefix and
  suffix. Brand marks align with the name's first line. Chat capability icons occupy a compact
  second line without chip backgrounds; provider management retains its default chip style.
  Rows span the sheet width, including their touch targets and neutral selected backgrounds,
  without cards or outlines. Dark selection and press fills stay subdued against the raised sheet;
  the name weight and selection mark remain the primary cues. The provider index floats above the
  rows instead of reserving a separate column. A fixed trailing slot holds the compact selection
  mark in single and multiple selection; tapping the floating index navigates providers rather than
  selecting the row beneath.
- `ModelPickerIcon` renders model identity used by picker consumers.
- `ModelSearchControls` composes the shared controlled `InlineSearch`: native in the iOS header and
  embedded in the Android controls frame. The drawer's `chat` variant adds the two high-value
  model traits (`Free` and `Vision`) as row badges and a compact filter menu; other workflows keep
  the picker neutral rather than exposing the provider capability taxonomy.
- `useModelSettingSelections` reads model selection preferences and saves partial updates. The
  settings screen persists each selection immediately.
- Model setting and model type helpers are exported from `index.ts`.
- Capability badges are public only through `@/frontend/components/ModelPicker/badges`: the
  `ModelPickerBadge` mark, its value type `ModelPickerBadgeValue`, and the pure badge rules. Provider
  settings use this entry so badge rows do not load the picker sheet. Other `components`, `hooks`,
  and `utils` paths remain private; module internals import their own leaves.

## Organization

- `components/` contains the model selection sheet, metadata, and filtering UI.
- `hooks/` owns model picker data and preference-backed model selection state.
- `utils/` contains pure model setting and model type helpers and tests.
