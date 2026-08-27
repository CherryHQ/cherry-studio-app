# UI Components

This reference defines what is true about shared components in Cherry Studio Mobile: who owns each
surface, and where a platform difference is legitimate. [UI Development](../guides/ui-development.md)
defines how to do the work — searching CherryUI first, composing component APIs, and promoting a
feature component into the package.

## The Platform Rule

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

### Decision Order

1. If the operating system or a provider renders the surface, expose a shared gateway and let the
   platform render it, including its native appearance and gestures.
2. If a native API, lifecycle, or bundling constraint cannot be represented safely in shared source,
   split only the private adapter and preserve the shared product contract.
3. If only a value, callback, or system behavior differs, keep one implementation and adapt the
   difference behind the component or navigation boundary.
4. Otherwise, use one shared implementation.

An import unavailable on the other platform, or one that would unnecessarily place a platform SDK in
the other platform's bundle, satisfies step 2. Color, spacing, radius, typography, shadow, and
product-control geometry never do.

Splitting under step 1 or step 2 changes neither the shared public API nor the product
specification; only the private adapter differs. A component may also use a React Native or
maintained third-party primitive internally, provided that dependency preserves the shared contract
and does not force feature code to branch by platform.

### Applying The Rule

Platform files follow [Platform Variants](./naming-conventions.md#platform-variants) and stay inside
the smallest component or gateway family that owns the difference. The dependency direction is:

```text
product screen or feature
        ↓
shared CherryUI component or semantic platform gateway
        ↓
private iOS / Android adapter when required
        ↓
operating-system or provider API
```

Existing `.ios.tsx` and `.android.tsx` files are implementation inventory, not precedent. Reassess
their boundary when substantially changing the component, but do not migrate unrelated components
incidentally.

## Ownership

`@cherrystudio/ui/components` is the public entry point for reusable, platform-neutral product
interaction components. Its [package README](../../packages/ui/README.md) is the component API
reference and the authority on what the package currently provides.

Runtime component imports use that entry point so Metro does not traverse icon registries:

```tsx
import { Button, Section, TextField } from '@cherrystudio/ui/components';
```

`@cherrystudio/app-icons` owns the Lucide SVG/Uniwind adapter. Runtime icons use default deep
imports such as `@cherrystudio/app-icons/icons/check`; its package root exports icon types only so
Metro does not traverse the full Lucide set. Feature code owns business state,
translations, query behavior, and workflow-specific composition. A local `Pressable` wrapper is
appropriate only while its interaction remains specific to that feature; repeated product
interaction behavior moves into CherryUI through the workflow in
[UI Development](../guides/ui-development.md). React Native `Button` is reserved for temporary
examples and non-product test screens.

Shared navigation and platform adapters may remain under `src/frontend/components` when their
contract depends on app navigation rather than a general product control. Feature screens do not
import platform UI SDKs directly. Direct `heroui-native` and `@expo/ui` usage remains limited to
capabilities whose native or third-party behavior is itself part of the contract; a package-owned
CherryUI wrapper becomes the public surface once the app standardizes behavior around such a
dependency.

App-level singleton surfaces are owned by CherryUI, mounted once at the app root, and reached
through one hook or component from `@cherrystudio/ui/components`. Toast, portal host, and global
alert are singletons. Feature code does not import a third-party toast or dialog hook directly and
does not mount a second host for the same surface.

## Platform Responsibilities

These capabilities keep one product-facing semantic API and surrounding flow while delegating system
behavior or presentation where it differs:

| Capability | Shared responsibility | Platform responsibility |
| --- | --- | --- |
| Back navigation | destinations, headers, and page composition | iOS interactive pop and Android system or predictive back |
| Navigation chrome | titles, action semantics, icons, menu items, and page composition | how header actions and search fields render into the native navigation bar |
| Window insets | layout and spacing rules | safe-area and system-bar inset values |
| Share and pickers | trigger and surrounding product flow | share sheet, photo picker, and document picker |
| File preview | metadata, loading, error, and fallback states | Quick Look or the available Android viewer |
| System alerts and action or context menus | semantic content, actions, roles, and state | native presentation, dismissal, and gesture dispatch |
| Permissions | pre-permission explanation and denied-state recovery | the system authorization prompt |
| Haptics and accessibility | intent, labels, state, and reduced-motion behavior | supported feedback and accessibility APIs |

Top-bar actions reach the native navigation bar through `headerLeft`, `headerRight`, or
`Stack.Toolbar` with Cherry-owned content.

System back gestures are never recreated in a general-purpose horizontal swipe component. Product
gestures start outside system back-gesture edge zones, and the navigation owner handles the platform
back contract.

The target cancellation and priority rules for tap, long press, scrolling, app-defined pan, and
native text selection are defined in
[Interaction And Gesture Arbitration](./interaction-and-gesture-arbitration.md). That reference is
currently `Status: design`; existing components are not assumed to conform without verification at
their native and cross-platform interaction boundaries.

## Visual System

Color, typography, spacing, radius, elevation, opacity, and animation semantics come from the same
Cherry design system on both platforms. [Design Spec](../../DESIGN.md) owns the token pipeline and
the rules for consuming tokens. General-purpose icons come from deep `@cherrystudio/app-icons/icons/*`
imports. Provider and model brands, avatars, logos, charts, and content images remain image assets.

Platform features enhance the common interaction contract without establishing a second product
visual language. On iOS, system-rendered controls and navigation inherit the current platform
appearance, including Liquid Glass where supported: the owning platform adapter lets the system
render that material, and product code does not reproduce it.

Liquid Glass is not a product-wide visual requirement. Cherry-owned content surfaces and ordinary
product components remain shared. A custom iOS-only glass treatment is optional progressive
enhancement, while Android and unsupported iOS versions retain the same hierarchy and a complete
fallback.

## Acceptance

### Platform Boundary

Reviewable from the change itself:

- New or substantially changed ordinary product components use one visual specification and shared
  source implementation across iOS and Android by default.
- A platform-specific file names the imposed constraint — native API, lifecycle, system-rendered
  surface, provider-owned control, or bundle — that prevents a correct shared implementation.
  Familiarity and convention are not constraints.
- A platform family shares one props type and one set of helpers, kept in the family directory
  rather than restated in each platform file.
- Platform gateways expose one semantic API and keep SDK types out of feature code.

### Control Quality

Reviewable by running the app:

- Controls expose accessible labels, state, disabled/loading behavior, and usable touch targets.
- A committed scroll or app-defined pan cancels competing tap and long-press candidates;
  cancellation remains inert through pointer-up.
- Text scales and wraps without fixed dimensions clipping its content.
- Platform enhancement failure leaves the control recognizable and usable.
- Ambiguous icon-only actions provide an accessible label and tooltip or menu context where the
  platform supports it.

## References

- [React Native platform-specific code](https://reactnative.dev/docs/platform-specific-code.html)
- [Apple Liquid Glass adoption guidance](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)
- [Apple Human Interface Guidelines: Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- [Android app quality guidance](https://developer.android.com/quality/user-experience)
