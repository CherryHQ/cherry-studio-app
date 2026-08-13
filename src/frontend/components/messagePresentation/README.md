# Message Presentation

This module owns the shared presentation of structured user and assistant messages. Chat and
painting provide domain state and composer layout; this module renders the virtualized message
history, message rows and parts, live-turn anchoring, entry motion, and scroll-to-bottom control.

## Public Interface

- `MessageList` renders a complete message history from `MessagePresentationItem` values.
- `MessagePresentationItem` contains only the persistence-neutral fields needed for presentation.
- `MessageListProps` accepts layout measurements plus optional pagination, readiness, entry-motion,
  bottom-accessory inputs, and a feature-owned assistant renderer. Chat uses the default assistant
  row; painting supplies its proportional loader and image result without changing message data.
  Single-turn workspaces can opt into animating their first entering anchor.
- The default assistant row projects speakable text only from a completed reply and exposes a
  controlled read-aloud action through `AssistantMessageActions`.

Message rows, part renderers, animation providers, and platform controls are private implementation
details. Callers import only from `@/frontend/components/messagePresentation`.

## Ownership

The module accepts only visible `user` and `assistant` messages. A feature that stores additional
roles must explicitly filter or adapt them before crossing this interface. Feature runtime,
persistence entities, composer state, and tool-approval orchestration remain with their owners.
Consumers own playback state and commands through `AssistantMessageActions`. Reasoning, tool
results, attachments, standalone code, and other non-spoken parts do not cross the read-aloud
projection.

## List Behavior

`MessageList` owns its `LegendList` ref, role-based recycling types, latest-user anchor derivation,
keyboard lift, at-bottom shared value, entry-animation provider, tail-follow state, and optional
scroll-to-bottom button. Callers provide stable presentation item references and only the layout
insets and callbacks they own.

The latest user message is anchored below the content header. Text anchors use a two-line height
cap; messages containing files use their full measured height. After reserved anchor space is
exhausted, item-size changes follow the tail until touch, drag, or momentum pauses the behavior.

User message rows visually separate managed file parts from the text bubble: a right-aligned,
horizontally scrollable attachment strip sits above the optional bubble. This is a presentation
projection only; files remain parts of the same message for model input, persistence, references,
and anchoring.

## Organization

- `components/MessageList.tsx` owns virtualization, anchoring, readiness, and list controls.
- `messageRow/` owns user and assistant row layouts plus the private slide-in provider.
- `messageContent/` dispatches structured message parts and owns citation/file hooks.
- `utils/` contains the private built-in tool presentation mapping.

## Motion

Discrete state transitions use the shared `@cherrystudio/ui/motion` vocabulary. New-message entry
and scroll-button visibility pair `duration.fast` with `easing.settle` at their owning components.
Pending assistant and reasoning rows consume `PrismSweep` from the Cherry UI loading family.
