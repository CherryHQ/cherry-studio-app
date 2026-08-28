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
- `AssistantMessage` owns standard assistant content: the pending placeholder, structured parts,
  and entry motion. Its `children` render after the message body, so a feature composes its own
  accessory (a toolbar, for example) without teaching this module about that feature's state. The
  slot is unconditional, including while the placeholder is up; an accessory holds the message and
  decides for itself when to appear.
- `UserMessage` owns standard user content, including managed attachments and the text bubble.
- `getBuiltInToolDisplay` exposes the shared title and platform-specific icon used by
  feature-owned tool approval UI.

A feature composes an explicit role variant and gives `MessageList` a stable `renderMessage`.
LegendList refreshes mounted rows through `itemKey`, `data`, and `extraData`; changing the renderer
identity alone is not a data channel. Dynamic rendered state therefore arrives through changed
message items, `extraData`, or a feature-owned context/store read inside the row.

Part renderers, animation providers, and platform controls remain private implementation details.
Callers import only from `@/frontend/components/messages`.

A tool that returns managed artifacts already has them in the message: the Host persists each one
as a `purpose: 'artifact'` file part that draws its own card. A per-tool renderer therefore renders
the *call*, never the artifact, or the same file appears twice.

## Ownership

The module accepts only visible `user` and `assistant` messages. A feature that stores additional
roles must explicitly filter or adapt them before crossing this interface. Feature runtime,
persistence entities, composer state, and tool-approval orchestration remain with their owners.

### Composition And Layout Contract

The screen composes the message history and composer as sibling regions. Within the history, layout
ownership flows from the list toward intrinsic content:

```text
ChatScreen or PaintingComposer
├── message workspace
│   └── MessageList
│       └── list-owned row frame
│           └── feature role renderer
│               └── UserMessage or AssistantMessage
│                   └── MessageParts
│                       └── individual part renderers
└── Composer.Dock
```

- The screen owns whether the message list and composer exist and passes their measured top and
  bottom insets across the list API.
- `MessageList` owns scrolling, content insets, row gutters, role-level row spacing, anchoring, and
  the placement of every rendered message. The feature renderer supplies content; it does not
  recreate list spacing.
- `UserMessage` and `AssistantMessage` own role presentation inside the row frame. They may define
  intrinsic width, internal grouping, bubbles, surfaces, and entry motion, but do not add list or
  screen gutters.
- `MessageParts` owns part order and spacing. Each part renderer owns only its internal visual and
  interaction contract; it does not position sibling parts or reach into the row frame.
- Feature-owned accessories, such as the assistant toolbar, compose after the message body. Their
  spacing from the body belongs to the assistant composition, not to an individual part.
- Parent layout must not copy private child padding. The latest-user text cap is the one current
  cross-layer geometry requirement: the user-message owner exposes its content-height contract,
  and the list derives the final capped row height by adding its own row padding. Messages with
  file parts continue to use their full measured height.

Exact spacing values live in code, not this document. Changing a list gutter or row inset must have
one list-owned source; changing intrinsic message padding must update the content owner's explicit
geometry contract when anchoring depends on it.

## List Behavior

`MessageList` owns its `LegendList` ref, role-based recycling types, latest-user anchor derivation,
keyboard lift, at-bottom shared value, row frames, entry-animation provider, and the business wiring
for the optional CherryUI scroll-to-bottom button. Callers provide stable message item references
and only the layout insets and callbacks they own.

The latest user message is anchored below the content header. Text anchors use a two-line height
cap; messages containing files use their full measured height. Initial Session entry and sending a
message may position the list once. Streaming content and item-size changes never scroll it; after
reserved anchor space is exhausted, `isAtEnd` reveals the scroll-to-bottom button. Clicking that
button scrolls once and does not enable any ongoing follow behavior. `maintainVisibleContentPosition`
stays enabled, and the readiness gate yields while touch, drag, or momentum interaction owns the
list position.

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
  gate, role-level row frame, interaction lock, and dev-only instrumentation.
- `rows/` owns the intrinsic user and assistant presentation inside the list-owned row frame.
- `motion/` carries the private slide-in provider shared by the list and rows.
- `parts/` owns ordered part composition and adapts Cherry message schema parts into CherryUI
  primitives. `parts/tools/` owns tool dispatch and tool-specific adapters;
  `parts/tools/metaTool/` composes explicit search, inspect, invoke, and exec variants.
- `parts/tools/builtInTool/` owns shared built-in tool labels. Only its `builtInToolIcon/` family is
  platform-specific.

There are no internal barrels. Rows and adapters import private leaf modules directly; feature
callers use only this module's root entry.

## Motion

Discrete state transitions use the shared `@cherrystudio/ui/motion` vocabulary. New-message entry
and scroll-button visibility pair `duration.fast` with `easing.settle` at their owning components.
Pending assistant and reasoning rows consume `PrismSweep` from the Cherry UI loading family.
