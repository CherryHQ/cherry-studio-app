# Message Presentation

This module owns the shared presentation of structured user and assistant messages. Chat and
painting provide domain state and composer layout; this module renders the virtualized message
history, message rows and parts, live-turn anchoring, and entry motion.

## Public Interface

- `MessageList` renders a complete message history from `MessagePresentationItem` values.
- `MessagePresentationItem` contains only the persistence-neutral fields needed for presentation.
- `MessageListProps` accepts layout measurements plus optional pagination, readiness, entry-motion,
  bottom-accessory inputs, and a feature-owned assistant renderer. Chat uses the default assistant
  row; painting supplies its proportional loader and image result without changing message data.
  Single-turn workspaces can opt into animating their first entering anchor.
- `AssistantMessage` is the default assistant row — pending placeholder, structured parts, and entry
  motion. Its `children` render after the message body, so a feature composes its own accessory
  (a toolbar, for example) into an otherwise standard message instead of teaching this module about
  that feature's state. The slot is unconditional, including while the placeholder is up; an
  accessory holds the message and decides for itself when to appear.

A feature-owned assistant row wraps `AssistantMessage` and reaches `MessageList` through
`renderAssistantMessage`, which must be a stable reference. LegendList refreshes mounted rows
through `itemKey`, `data`, and `extraData` — a new `renderItem` identity is not a channel for
pushing state into them. Dynamic state therefore has to arrive either as changed message items
(painting's route) or through the feature's own context or external store read inside the accessory
(the route for message actions).

Other message rows, part renderers, animation providers, and platform controls are private
implementation details. Callers import only from `@/frontend/components/messagePresentation`.

## Ownership

The module accepts only visible `user` and `assistant` messages. A feature that stores additional
roles must explicitly filter or adapt them before crossing this interface. Feature runtime,
persistence entities, composer state, and tool-approval orchestration remain with their owners.

## List Behavior

`MessageList` owns its `LegendList` ref, role-based recycling types, latest-user anchor derivation,
keyboard lift, at-bottom shared value, entry-animation provider, and the business wiring for the
optional CherryUI scroll-to-bottom button. Callers provide stable presentation item references and
only the layout insets and callbacks they own.

The latest user message is anchored below the content header. Text anchors use a two-line height
cap; messages containing files use their full measured height. Initial topic entry and sending a
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

- `components/MessageList.tsx` is the wiring layer: virtualization config, layout derivations, and
  list controls. The behavior engines live beside it in `components/hooks/` — `useAnchorPin`
  (anchor pinning, first-anchor staging, readiness gate, and its interaction lock) and
  `useLayoutBenchInstrumentation` (dev-only layout probes). Measurement-backed comments travel
  with the code they explain.
- `messageRow/` owns user and assistant row layouts plus the private slide-in provider.
- `messageContent/` dispatches structured message parts and owns citation/file hooks.
- `utils/` contains the private built-in tool presentation mapping.

## Motion

Discrete state transitions use the shared `@cherrystudio/ui/motion` vocabulary. New-message entry
and scroll-button visibility pair `duration.fast` with `easing.settle` at their owning components.
Pending assistant and reasoning rows consume `PrismSweep` from the Cherry UI loading family.
