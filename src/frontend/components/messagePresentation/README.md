# Message Presentation

This module owns the shared presentation of structured user and assistant messages. Chat and
painting provide domain state and composer layout; this module renders the virtualized message
history, message rows and parts, live-turn anchoring, entry motion, and scroll-to-bottom control.

## Public Interface

- `MessageList` renders a complete message history from `MessagePresentationItem` values.
- `MessagePresentationItem` contains only the persistence-neutral fields needed for presentation.
- `MessageListProps` accepts layout measurements plus optional pagination, readiness, entry-motion,
  and bottom-accessory inputs.

Message rows, part renderers, animation providers, and platform controls are private implementation
details. Callers import only from `@/frontend/components/messagePresentation`.

## Ownership

The module accepts only visible `user` and `assistant` messages. A feature that stores additional
roles must explicitly filter or adapt them before crossing this interface. Feature runtime,
persistence entities, composer state, and tool-approval orchestration remain with their owners.

## List Behavior

`MessageList` owns its `LegendList` ref, role-based recycling types, latest-user anchor derivation,
keyboard lift, at-bottom shared value, entry-animation provider, tail-follow state, and optional
scroll-to-bottom button. Callers provide stable presentation item references and only the layout
insets and callbacks they own.

The latest user message is anchored below the content header. Text anchors use a two-line height
cap; messages containing files use their full measured height. After reserved anchor space is
exhausted, item-size changes follow the tail until touch, drag, or momentum pauses the behavior.

## Organization

- `components/MessageList.tsx` owns virtualization, anchoring, readiness, and list controls.
- `messageRow/` owns user and assistant row layouts plus the private slide-in provider.
- `messageContent/` dispatches structured message parts and owns citation/file hooks.
- `utils/` contains the private built-in tool presentation mapping.

## Motion

Discrete state transitions use the shared `@cherrystudio/ui/motion` vocabulary. New-message entry
and scroll-button visibility pair `duration.fast` with `easing.settle` at their owning components.
Pending assistant and reasoning rows consume `PrismSweep` from the Cherry UI loading family.
