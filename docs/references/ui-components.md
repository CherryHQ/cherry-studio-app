# UI Components

This reference defines the shared component design, ownership, and platform boundaries for Cherry
Studio Mobile. Follow [UI Development](../guides/ui-development.md) when creating or changing
product UI.

## Design Direction

One rule governs every platform decision:

> Respect a platform difference the platform imposes. Do not introduce one it does not.

A difference is **imposed** when the operating system, a native API, a system-rendered surface, or
the platform bundle requires it: the shared source cannot express the behavior, or expressing it in
shared source would be incorrect. Imposed differences are respected in full, including the system's
own appearance, gestures, and accessibility behavior. Reproducing a system surface in JavaScript to
keep the source uniform is a worse outcome than splitting it.

A difference is **chosen** when shared source could express it correctly and the argument for
splitting is that one platform's result would look or feel more conventional. Chosen differences are
not introduced. Cherry Studio has one product identity across iOS and Android; platform design
conventions are input to the design, not a reason to maintain separate Cupertino and Material
component families.

The test is whether the shared implementation would be *wrong*, not whether it would be
*unfamiliar*. Ordinary product components have no imposed difference and do not fork.

Use this decision order:

1. If the operating system or a provider renders the surface, expose a shared gateway and let the
   platform render it, including its native appearance and gestures.
2. If a native API, lifecycle, or bundling constraint cannot be represented safely in shared source,
   split only the private adapter and preserve the shared product contract.
3. If only a value, callback, or system behavior differs, keep one implementation and adapt the
   difference behind the component or navigation boundary.
4. Otherwise, use one shared implementation.

Existing `.ios.tsx` and `.android.tsx` files are implementation inventory, not precedent. Reassess
their boundary when substantially changing the component, but do not migrate unrelated components
incidentally.

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

App-level singleton surfaces are owned by CherryUI, mounted once at the app root, and reached
through one hook or component from `@cherrystudio/ui/components`. Toast, portal host, and global
alert are singletons. Feature code does not import a third-party toast or dialog hook directly and
does not mount a second host for the same surface.

## Implementation Model

The dependency direction is:

```text
product screen or feature
        ↓
shared CherryUI component or semantic platform gateway
        ↓
private iOS / Android adapter when required
        ↓
operating-system or store API
```

Feature screens do not import platform UI SDKs directly. Platform files follow
[Platform Variants](./naming-conventions.md#platform-variants) and remain inside the smallest
component or gateway family that owns the difference.

Use a small conditional inside a shared component when only a value or callback differs. Use
matching platform files only when shared source cannot safely represent the underlying native API,
lifecycle, rendered system surface, or bundling boundary. An import that is unavailable on the other
platform or would unnecessarily place a platform SDK in its bundle is a valid reason to isolate an
adapter. Do not use platform files solely for color, spacing, radius, typography, shadow, or
product-control geometry.

## Component Classification

### Shared Visuals And Implementation By Default

The following component families normally use one design and one implementation on iOS and
Android:

- typography, icons, images, avatars, badges, chips, and dividers;
- buttons, icon buttons, text fields, search fields, checkboxes, radio controls, switches, sliders,
  segmented controls, and tabs;
- cards, list rows, sections, surfaces, and product-drawn toolbars;
- product-composed dialogs, bottom sheets, toasts, popovers, tooltips, and rich business menus;
- progress indicators, skeletons, loading states, empty states, and error states; and
- chat messages, composer parts, settings content, and account screens.

A family in this list may still use a private platform adapter when it meets an exception in the
implementation model. The exception does not change its shared public API or product specification.

This rule includes visual tokens and motion. Color, typography, spacing, radius, elevation, opacity,
and animation semantics come from the same Cherry design system on both platforms. General-purpose
icons also use the shared Cherry icon registry; only platform brands or truly system-semantic
artwork require an adapter.

A control may still use a standard React Native or maintained third-party primitive internally.
That dependency must preserve the shared Cherry contract and must not force feature code to branch
by platform.

### Shared Product Contract With Platform Behavior

These capabilities keep one product-facing semantic API and surrounding flow while delegating
system behavior or presentation where it differs:

| Capability | Shared responsibility | Platform responsibility |
| --- | --- | --- |
| Back navigation | destinations, headers, and page composition | iOS interactive pop and Android system or predictive back |
| Navigation chrome | titles, action semantics, icons, menu items, and page composition | how header actions and search fields are rendered into the native navigation bar |
| Window insets | layout and spacing rules | safe-area and system-bar inset values |
| Share and pickers | trigger and surrounding product flow | share sheet, photo picker, and document picker |
| File preview | metadata, loading, error, and fallback states | Quick Look or the available Android viewer |
| System alerts and action or context menus | semantic content, actions, roles, and state | native presentation, dismissal, and gesture dispatch |
| Permissions | pre-permission explanation and denied-state recovery | the system authorization prompt |
| Haptics and accessibility | intent, labels, state, and reduced-motion behavior | supported feedback and accessibility APIs |

Do not recreate system back gestures in a general-purpose horizontal swipe component. Product
gestures avoid system edge zones, while the navigation owner handles the platform back contract.

A provider that owns its rendered control, such as a branded sign-in or wallet button, follows the
same shape: one shared entry surface and flow, with the official control supplied by a private
platform adapter. Cherry Mobile ships no such capability today, so this reference defines no
concrete provider boundaries.

## Platform Boundaries

- Platform features enhance the common interaction contract without establishing a second product
  visual language.
- On iOS, system-rendered controls and navigation inherit the current platform appearance,
  including Liquid Glass where supported. The owning platform adapter lets the system render this
  material; product code does not reproduce it.
- Liquid Glass is not a product-wide visual requirement. Cherry-owned content surfaces and
  ordinary product components remain shared. A custom iOS-only glass treatment is optional
  progressive enhancement, while Android and unsupported iOS versions retain the same hierarchy
  and a complete fallback.
- Expo Router and React Navigation top-bar actions use `headerRight`, `headerLeft`, or
  `Stack.Toolbar` with Cherry-owned content.
- Android horizontal product gestures start outside system back-gesture edge zones.
- React Native `Button` is reserved for temporary examples and non-product test screens. Product UI
  uses CherryUI or a feature-owned `Pressable` while the interaction remains local.

## Acceptance

- New or substantially changed ordinary product components use one visual specification and shared
  source implementation across iOS and Android by default.
- A platform-specific file names the imposed constraint — native API, lifecycle, system-rendered
  surface, provider-owned control, or bundle — that prevents a correct shared implementation.
  Familiarity and convention are not constraints.
- A platform family shares one props type and one set of helpers, kept in the family directory
  rather than restated in each platform file.
- Platform gateways expose one semantic API and keep SDK types out of feature code.
- Controls expose accessible labels, state, disabled/loading behavior, and usable touch targets.
- Text scales and wraps without fixed dimensions clipping its content.
- Platform enhancement failure leaves the control recognizable and usable.
- Ambiguous icon-only actions provide an accessible label and tooltip or menu context where the
  platform supports it.
- Repeated product interaction behavior moves to CherryUI through the workflow in
  [UI Development](../guides/ui-development.md).

## References

- [React Native platform-specific code](https://reactnative.dev/docs/platform-specific-code.html)
- [Apple Liquid Glass adoption guidance](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)
- [Apple Human Interface Guidelines: Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- [Android app quality guidance](https://developer.android.com/quality/user-experience)
