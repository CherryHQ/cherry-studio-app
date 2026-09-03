# UI Development

This guide defines shared component ownership and the component-composition workflow. Visual and
motion decisions follow the [Design Spec](../../DESIGN.md); current component behavior and platform
boundaries live in [UI Components](../references/ui-components.md).

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

## Own Layout At The Container Boundary

A container owns the placement of its immediate children: flow, alignment, external spacing,
content insets, and constraints imposed by the available region. A child owns its intrinsic
content, internal spacing, surface, typography, and interactions. Natural child-size changes still
participate in layout; a child must not reach outward with margins, offsets, or parent-specific
positioning to arrange its siblings.

- Put sibling spacing on their common container with `gap` or container padding. Do not distribute
  half of a gap across child margins.
- Keep reusable content components free of screen and list gutters. The screen, list, grid, or row
  frame that places them owns those external insets.
- Do not repeat a child's private padding or internal dimensions as a magic number in its parent.
  When parent behavior genuinely needs child geometry, prefer measured size; otherwise expose the
  smallest explicit layout contract from the child owner and derive the parent value from it.
- A composition component owns the ordering and spacing of the parts it combines. Individual parts
  own only their internal presentation and interaction unless their public API explicitly states a
  layout role.
- In a virtualized list, keep viewport and content insets at the list boundary, row placement in a
  list-owned row frame, and rendered item content below that frame. Size estimates and anchoring
  must include the row frame without teaching item content about virtualization.

This complements the single-owner spacing rule in [`DESIGN.md`](../../DESIGN.md#shape-and-spacing):
the visual specification defines how spacing is chosen, while this guide defines which component
owns it.

## Report Outcomes

Each situation has one feedback owner. Choose by what the user must do next, not by how severe the
failure feels:

- A screen that cannot load, or has nothing to show, renders `ContentState` inline with a retry
  action when the load can be repeated.
- An action whose outcome leaves the user on the same surface reports through `toast`: `success`
  for a completed change, `danger` for a failure the user can simply repeat. A failure title on its
  own is never an alert.
- `alert.show` is reserved for text the user has to read before continuing: validation that blocks
  a submit, diagnostic detail the user explicitly asked for such as a connection or model check, and
  permission guidance. Use `alert.confirm` or `alert.prompt` only when the user must decide.
- A failure that belongs to a transcript renders inline as a message part; see
  [Agent Protocol](../references/agent/agent-protocol.md#errors).
- Backend `message` strings are diagnostic and are never displayed. Translate from the closed code
  instead.

## Acceptance

- Shared controls retain accessible labels, states, scalable text, and usable platform fallbacks.
- Competing gestures have one documented winner and cancelled interactions do not fire on release.
- Feature components keep business state and translations outside CherryUI.
- Outcome feedback follows [Report Outcomes](#report-outcomes): toasts for in-place outcomes,
  alerts only for text that must be read or a decision.
- Containers own external placement and reusable children do not carry screen-specific gutters.
- Motion defines a clear purpose, remains responsive and interruptible, provides a complete reduced
  or unavailable-motion result, and leaves target-specific adaptation with its interaction owner.
- Visual changes are inspected in light and dark themes on a device.
- iOS device work in parallel worktrees follows
  [Parallel Device Testing](./parallel-device-testing.md).
