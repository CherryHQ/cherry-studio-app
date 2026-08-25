# Messages

This module owns the shared rendering of structured user and assistant messages. Chat and
painting provide domain state and composer layout; this module renders the virtualized message
history, message rows and parts, live-turn anchoring, and entry motion.

## Public Interface

- `MessageList` renders a virtualized history from `MessageListItem` values and delegates
  every row to the feature-owned `renderMessage` function.
- `MessageListItem` contains only the persistence-neutral fields needed for rendering.
- `MessageListProps` accepts layout measurements plus optional pagination, readiness, entry-motion,
  bottom-accessory inputs, the feature renderer, and optional `extraData` for rendered state that is
  not carried by message items. Single-turn workspaces can opt into animating their first anchor.
- `AssistantMessage` owns the standard assistant row: pending placeholder, structured parts, and
  entry motion. Its `children` render after the message body, so a feature composes its own accessory
  (a toolbar, for example) into an otherwise standard message instead of teaching this module about
  that feature's state. The slot is unconditional, including while the placeholder is up; an
  accessory holds the message and decides for itself when to appear.
- `UserMessage` owns the standard user row, including managed attachments and the text bubble.
- `getBuiltInToolDisplay` exposes the shared title and platform-specific icon used by
  feature-owned tool approval UI.

A feature composes an explicit role variant and gives `MessageList` a stable `renderMessage`.
LegendList refreshes mounted rows through `itemKey`, `data`, and `extraData`; changing the renderer
identity alone is not a data channel. Dynamic rendered state therefore arrives through changed
message items, `extraData`, or a feature-owned context/store read inside the row.

Part renderers, animation providers, and platform controls remain private implementation details.
Callers import only from `@/frontend/components/messages`.

## Ownership

The module accepts only visible `user` and `assistant` messages. A feature that stores additional
roles must explicitly filter or adapt them before crossing this interface. Feature runtime,
persistence entities, composer state, and tool-approval orchestration remain with their owners.

## List Behavior

`MessageList` owns its `LegendList` ref, role-based recycling types, latest-user anchor derivation,
keyboard lift, at-bottom shared value, entry-animation provider, and the business wiring for the
optional CherryUI scroll-to-bottom button. Callers provide stable message item references and
only the layout insets and callbacks they own.

The latest user message is anchored below the content header. Text anchors use a two-line height
cap; messages containing files use their full measured height. Initial Session entry and sending a
message may position the list once. Streaming content and item-size changes never scroll it; after
reserved anchor space is exhausted, `isAtEnd` reveals the scroll-to-bottom button. Clicking that
button scrolls once and does not enable any ongoing follow behavior.

Keyboard lift is `whenAtEnd`, and it depends on `patches/react-native-keyboard-controller@…`: the
patch makes a shrinking keyboard clamp the offset into the range that is valid *now* instead of
rewinding the displacement recorded when it opened. Sending grows the reserved anchor space while
the keyboard is still up, which moves the end — rewinding then drags the content 310px away from
it, one frame before the pin animation. Changing the lift mode or losing the patch brings that
back; `MessageList.tsx` carries the measurements.

User message rows visually separate managed file parts from the text bubble: a right-aligned,
horizontally scrollable attachment strip sits above the optional bubble. This is a presentation
projection only; files remain parts of the same message for model input, persistence, references,
and anchoring.

## Organization

- `MessageList.tsx` is the wiring layer. `list/` owns its layout policy, anchor pinning, readiness
  gate, interaction lock, and dev-only instrumentation.
- `rows/` owns the standard user and assistant row layouts.
- `motion/` carries the private slide-in provider shared by the list and rows.
- `parts/` adapts Cherry message schema parts into CherryUI primitives. `parts/tools/` owns tool
  dispatch and tool-specific adapters; `parts/tools/metaTool/` composes explicit search, inspect,
  invoke, and exec variants.
- `parts/tools/builtInTool/` owns shared built-in tool labels. Only its `builtInToolIcon/` family is
  platform-specific.

There are no internal barrels. Rows and adapters import private leaf modules directly; feature
callers use only this module's root entry.

## Motion

Discrete state transitions use the shared `@cherrystudio/ui/motion` vocabulary. New-message entry
and scroll-button visibility pair `duration.fast` with `easing.settle` at their owning components.
Pending assistant and reasoning rows consume `PrismSweep` from the Cherry UI loading family.
