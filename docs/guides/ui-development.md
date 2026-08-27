# UI Development

This guide defines shared component ownership and the component-composition workflow. Current
component behavior and platform boundaries live in [UI Components](../references/ui-components.md).

## Start With CherryUI

Search `@cherrystudio/ui/components` and read `packages/ui/README.md` before creating a product
interaction primitive. Product code imports shared components from the component-only entry point:

```tsx
import { Button, Section, TextField } from '@cherrystudio/ui/components';
```

Keep a component feature-local when its state, language, or interaction belongs to one business
workflow. Move it into CherryUI only when it is reusable across independent features and fits the
package's platform-neutral interaction ownership.

When CherryUI lacks a qualifying reusable component, create it in an independent bottom PR before
the feature integration PR. Use a `gh-stack` layer when the integration depends on that component.

When an implementation differs between iOS and Android, follow
[Platform Variants](../references/naming-conventions.md#platform-variants): keep the full component
family in its own directory and use matching `.ios.tsx` and `.android.tsx` files.

When a target combines tap, long press, scrolling, app-defined pan, or native text selection, also
read [Interaction And Gesture Arbitration](../references/interaction-and-gesture-arbitration.md).
It is a target design, not a statement that current components already satisfy the contract. Define
the eligible interactions and cancellation order before choosing a gesture implementation.

## Compose Component APIs

Use the project `vercel-composition-patterns` skill when creating or substantially changing a
reusable React component API. In particular:

- compose explicit variants instead of accumulating boolean mode props;
- use compound components and children for structural composition;
- keep state implementation inside providers behind a stable state/actions/meta interface;
- lift shared state to the provider that owns all consumers; and
- use React 19 ref and context APIs in new or substantially changed component APIs.

Apply this rule prospectively. Do not migrate an untouched `forwardRef` component as incidental work.
Render callbacks remain appropriate when a parent must supply item data, such as a virtualized
list's `renderItem`.

## Acceptance

- Shared controls retain accessible labels, states, scalable text, and usable platform fallbacks.
- Competing gestures have one documented winner and cancelled interactions do not fire on release.
- Feature components keep business state and translations outside CherryUI.
- Visual changes are inspected in light and dark themes on a device.
- iOS device work in parallel worktrees follows
  [Parallel Device Testing](./parallel-device-testing.md).
