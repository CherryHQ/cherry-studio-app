# SecureInput Trailing Slot Design

## Context

`SecureInput` currently renders a complete bordered `Input` and places the visibility button over
its right edge with absolute positioning. A fixed `paddingRight` reduces the normal text area, but
the button remains a floating overlay rather than a layout participant. The component should make
the visibility action a real trailing slot so long values cannot render beneath it.

## Goals

- Keep one continuous input border with no separator before the visibility action.
- Reserve a fixed trailing slot for the visibility action in normal flex layout.
- Constrain the editable text to the remaining width and clip content at the slot boundary.
- Preserve the current controlled value contract, visibility animation, accessibility labels,
  disabled state, and `blurOnVisibilityToggle` behavior.
- Keep all call sites and the public `SecureInputProps` API unchanged.

## Design

`SecureInput` will render a horizontal outer container that owns the shared border, background,
rounded corners, minimum height, and overflow clipping. The inner `Input` will be the flexible text
region with `flex: 1` and `minWidth: 0`; its own border and corner treatment will be removed so the
outer container remains the only visible field surface.

The visibility button will follow the input as a fixed-width, non-shrinking trailing child. Its
width remains 44 points, retaining the existing touch target. Because the two children participate
in flex layout, the input's layout box ends at the leading edge of the visibility slot. Long text
therefore scrolls or clips within the input rather than painting beneath the button.

The outer container will reflect the input's invalid and disabled presentation. Focus behavior does
not change: visibility toggles retain focus by default, while consumers that pass
`blurOnVisibilityToggle` still blur before changing visibility. The two icon layers and their
cross-fade animation remain unchanged.

HeroUI Native's `InputGroup` is not used because its suffix is also absolutely positioned and only
reserves space by applying measured input padding. Adding a general trailing-action API to `Input`
is also out of scope because no other current consumer requires that shared contract.

## Verification

No automated test will be added, following the agreed non-TDD scope. Verification will cover:

- formatting and targeted type/lint checks for the changed component;
- Storybook or an existing app call site with a value longer than the available field width;
- confirmation that the text stops before the visibility slot in hidden and visible states;
- confirmation that visibility animation, default focus retention, Web Search blur behavior, and
  disabled presentation remain intact.
