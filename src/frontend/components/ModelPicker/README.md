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
- Capability badges are public only through `@/frontend/components/ModelPicker/badges`: the
  `ModelPickerBadge` mark, its value type `ModelPickerBadgeValue`, and the pure badge rules. Provider
  settings use this entry so badge rows do not load the picker sheet. Other `components`, `hooks`,
  and `utils` paths remain private; module internals import their own leaves.

## Organization

- `components/` contains the model selection sheet, metadata, and filtering UI. Inside a
  `PolicyScope` the sheet offers only the policy's allowed models (`useModelChoice`).
- `hooks/` owns model picker data and preference-backed model selection state.
- `utils/` contains pure model setting and model type helpers and tests.

## Community Cloud availability

The picker observes `Backend.cloud` through `useCloud`. Cloud rows receive account-scoped free
labels and unavailability reasons; exhausted or unauthorized rows cannot be selected. The
`cloudUse` input defaults to `agent`; non-conversation text entry points select `general` (both
chat and translation rights). Selection is only a presentation check: the Cloud request boundary
rechecks entitlement, expiry and quota before every send.
