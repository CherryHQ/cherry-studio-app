# UI Components

This reference defines current shared component ownership and platform boundaries. Follow
[UI Development](../guides/ui-development.md) when creating or changing product UI.

## Ownership

`@cherrystudio/ui/components` is the public entry point for reusable, platform-neutral product
interaction components. The package currently owns buttons, fields, menus, sheets, composer parts,
surfaces, loading states, tabs, sliders, switches, sections, portals, and related primitives. Its
[package README](../../packages/ui/README.md) is the component API reference.

Runtime component imports use that entry point so Metro does not traverse icon registries:

```tsx
import { Button, Section, TextField } from '@cherrystudio/ui/components';
```

`@cherrystudio/app-icons` owns the cross-platform icon registry. Feature code owns business state,
translations, query behavior, and workflow-specific composition. A local `Pressable` wrapper is
appropriate only while its interaction remains specific to that feature. Shared navigation and
platform adapters may remain under `src/frontend/components` when their contract depends on app
navigation rather than a general product control.

Direct `heroui-native` and `@expo/ui` usage remains limited to capabilities whose native or
third-party behavior is itself part of the contract. A package-owned CherryUI wrapper is the public
surface once the app standardizes behavior around such a dependency.

## Platform Boundaries

- Platform features enhance the common interaction contract. iOS Liquid Glass may enhance
  appearance; Android and older iOS retain a complete fallback.
- Expo Router and React Navigation top-bar actions use `headerRight`, `headerLeft`, or
  `Stack.Toolbar` with Cherry-owned content.
- Android horizontal product gestures start outside system back-gesture edge zones.
- React Native `Button` is reserved for temporary examples and non-product test screens. Product UI
  uses CherryUI or a feature-owned `Pressable` while the interaction remains local.

## Acceptance

- Controls expose accessible labels, state, disabled/loading behavior, and usable touch targets.
- Text scales and wraps without fixed dimensions clipping its content.
- Platform enhancement failure leaves the control recognizable and usable.
- Ambiguous icon-only actions provide an accessible label and tooltip or menu context where the
  platform supports it.
- Repeated product interaction behavior moves to CherryUI through the workflow in
  [UI Development](../guides/ui-development.md).
