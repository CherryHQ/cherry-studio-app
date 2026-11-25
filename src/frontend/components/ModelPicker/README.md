# Model Picker

This module owns the model selection surface, model metadata UI, and model setting helpers.

## Public Interface

- `ModelPickerDrawer` is the standard model-selection sheet. Agent editing, painting, provider
  connectivity checks, and model settings all open this bottom sheet. Its search field filters the
  grouped model catalog in place without leaving the sheet. Callers may supply `onAddProvider` so
  the unfiltered empty state can hand off to provider setup without coupling the picker to routing.
  Focusing search expands the sheet from `medium` to `full`. Clearing search, dismissing the keyboard,
  changing filters, and scrolling the model list or fast scroller retain the current height; only
  dragging the top header/search region resizes between `medium` and `full` or dismisses the
  sheet, while the model list and provider index scroll freely at both detents without losing the
  current conditions. `ModelPickerDrawer` renders with `presentation="default"` (keeping its header
  visible even when opened over another sheet), remains lazily mounted until opened and through its
  close settlement, and supplies `bodyInset="none"` so `ModelPickerList` and
  `ModelPickerFastScroller` own the bottom safe-area inset without clipping rows above it. A filtered
  empty state offers one action to clear search and filters.
- `ModelPickerList` renders the grouped selectable model rows inside that sheet and the onboarding
  page. Onboarding supplies its own discovered or entitled candidates, including models not yet
  saved or enabled; the list owns row visuals, avatars, capability badges, and selection marks.
  Its `disabled` input prevents selection while a caller is saving. A long visible
  model list adds a right-side fast scroller with one distinct marker per provider. Provider markers
  jump to their group headers without changing provider/order-key order. The contact-style index
  floats in a narrow frosted-glass capsule centered in the model-list viewport, capped at 80% of
  that viewport's current height. It grows with the sheet until all providers fit. Provider rows
  retain 48-point targets and 20-point icons; overflow scrolls vertically without a visible scrollbar.
  A press shows the private `ModelPickerProviderPreview` to the left: a separate glass identity
  surface 152 points wide and at least 144 points tall, with a rounded 48-point provider avatar
  and a two-line name. It reuses provider identity and uploaded-avatar resolution. The preview
  remains next to the index and may temporarily cover list content or selection marks; it fades
  out on release and respects reduced motion. A completed tap jumps to its group. When a long
  press takes over, sliding across the visible markers updates the preview and highlight, and
  releasing closes the preview. Dragging before the long press scrolls the index, clears the
  preview, and cancels the tap. A touch that stops momentum does not navigate. The immediate
  native press keeps the interaction inside the provider index.
  The preview never intercepts touches. Scrolling the model list reveals its current provider in
  the index without interrupting a navigation drag or momentum scroll.
  Model names stay on one line with middle truncation, retaining their identifying prefix and
  suffix. Brand marks align with the name's first line. Chat capability icons occupy a compact
  second line without chip backgrounds; provider management retains its default chip style.
  The list supplies one `BlurTargetView` for the index and preview, rendered before both effects.
  Android uses `dimezisBlurViewSdk31Plus`, with a translucent fallback on older systems. Material
  overlays, borders, and foregrounds use the shared light/dark theme tokens.
  Rows span the sheet width, including their touch targets and neutral selected backgrounds,
  without cards or outlines. Dark selection retains a neutral fill against the raised sheet;
  the name weight and selection mark remain the primary cues. The provider index floats above the
  rows. While the index is visible, the list reserves its 48-point touch area plus an 8-point gap
  inside each row's content; short lists keep their existing insets. A fixed trailing slot holds
  the compact selection mark in single and multiple selection clear of the permanent index.
  Tapping the floating index navigates providers rather than selecting the row beneath.
  The diagnostic panel also embeds this public list and `useModelPickerData` so model selection
  stays inside its existing full-height sheet.
  Embedded consumers use `contentInset="none"` when their container already owns the gutter;
  the shared picker keeps its existing inset by default.
  `density="compact"` pairs 24-point model artwork with compact model text and group labels for
  embedded flows; the standard picker retains its default row size.
- `ModelPickerIcon` renders model identity used by picker consumers.
- `ModelSearchControls` composes the shared controlled `InlineSearch`: native in the iOS header and
  embedded in the Android controls frame. The drawer's `chat` and `usage` variants add the two
  high-value model traits (`Free` and `Vision`) as row badges and a compact filter menu. The
  default variant keeps the picker neutral.
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

The community `chat` drawer shows AMD models that the current account's catalog offers for chat
but requires activation to use. These rows support search and the capability filters. Their lock
opens the shared activation prompt and never changes the current selection. They are read directly
from the catalog alongside the selectable models projected to local storage.

When CherryAI is enabled, browsing or searching can reveal its built-in group and guest sign-in
action even with no matching model rows. Disabling the provider also hides its locked offers.
The `usage` filter keeps the trait badges and uses selectable models only.

The picker observes `Backend.cloud` through `useCloud`. Models receive unavailability reasons when
the current account cannot use them. Exhausted or unauthorized rows cannot be selected.
The `cloudUse` input defaults to `agent`; non-conversation text entry points select `general` (both
chat and translation rights). Selection is only a presentation check: the Cloud request boundary
rechecks entitlement, expiry and quota before every send.
