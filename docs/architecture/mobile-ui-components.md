# Cherry Mobile UI Components

Status: current

Related decision:

- [ADR 0003: Use Pressable Wrappers For Product Buttons](../adr/0003-use-pressable-wrappers-for-product-buttons.md)
- [ADR 0006: Use Platform-Native Navigation Gestures](../adr/0006-use-platform-native-navigation-gestures.md)

This document defines Cherry Mobile interaction component boundaries, focused on current button/control ownership, top navigation actions, and platform enhancement strategy. Terms follow [CONTEXT.md](../../CONTEXT.md).

## Principles

- Product UI does not use React Native `Button` as the general button foundation.
- Product buttons should move toward Cherry-owned or feature-local `Pressable` wrappers that centralize pressed, disabled, loading, hit slop, accessibility, and visual states.
- Platform features are enhancements, not the base interaction contract. iOS Liquid Glass can enhance appearance, while Android and older iOS must keep equally usable fallbacks.
- Expo Router / React Navigation top-bar buttons use `headerRight` / `headerLeft` with Cherry-owned content.
- Product horizontal gestures must not start from Android system edge zones, so they do not steal platform-native back gestures.

## Current Component Layers

`HeaderIconButton`:

- Shared Android header icon button used by header adapters.
- Wraps `Pressable`, accessibility role/label, disabled behavior, hit slop, and active opacity.
- iOS header adapters currently use Expo Router `Stack.Toolbar` instead of this wrapper.

Feature-local Pressable wrappers:

- Settings, chat input, and provider/model screens still contain local `Pressable` controls.
- Local wrappers are acceptable when the state and styling are feature-specific.
- Repeated interaction behavior should be extracted into a shared wrapper before it spreads across modules.

HeroUI and Expo UI controls:

- The app uses `heroui-native` controls for some settings and search-field surfaces.
- The app uses `@expo/ui` community menus and platform controls for native-feeling surfaces; bottom sheets use the app-owned `@/components/bottomSheet` wrapper over `@swmansion/react-native-bottom-sheet`.
- These libraries are component choices, not replacements for Cherry-owned product interaction rules.

Planned shared wrappers:

- `AppPressable`, `AppButton`, `IconButton`, and glass variants are not current shared components.
- Add them only when they remove repeated behavior from multiple product modules.
- If a glass variant is added, it must remain a visual enhancement with Android and older-iOS fallbacks.

## React Native Button Boundary

RN `Button` is acceptable for temporary code, demos, system examples, or non-product test screens. Product screens default away from it because it:

- Has limited styling and is hard to align with Cherry's visual system.
- Does not carry custom pressed/loading/disabled behavior well.
- Is not a good entry point for Liquid Glass enhancement.
- Has less controllable cross-platform behavior.

## Top Navigation Actions

Android top navigation actions use shared header wrappers and self-rendered headers where needed:

```tsx
<HeaderIconButton accessibilityLabel={t('navigation.newChat')} onPress={openNewTopic}>
  <SquarePenIcon className="size-6 text-foreground" strokeWidth={2} />
</HeaderIconButton>
```

iOS header adapters currently use Expo Router `Stack.Toolbar`. The base capability must remain available on Android through app-owned components.

## Acceptance

- Every product button has accessibility state, and any disabled/loading behavior that the feature exposes.
- Header buttons keep consistent tap targets on iOS and Android.
- Buttons remain recognizable, tappable, and accessible when platform-specific enhancement is unavailable.
- Icon buttons do not require nearby explanatory text to be understood. Ambiguous icons need a tooltip or menu context.
- New repeated button variants should extend Cherry wrappers instead of repeating `Pressable` state logic inside feature components.
- Swipe actions, carousels, and similar horizontal components must avoid Android system edge back areas.
