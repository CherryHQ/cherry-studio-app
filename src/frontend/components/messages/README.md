# Messages

This module owns the shared rendering of structured user and assistant messages. Chat and
painting provide domain state and composer layout; this module renders the virtualized message
history, message rows and parts, viewport following, and scroll restoration.

## Public Interface

- `MessageList` renders a virtualized history from `MessageListItem` values and delegates
  every row to the feature-owned `renderMessage` function.
- `MessageListItem` contains only the persistence-neutral fields needed for rendering. Its optional
  `partKeys` carries source-owned part identity beside the projected visual parts; renderers never
  synthesize positional identity when that source identity is available.
- `MessageListProps` accepts layout measurements plus optional pagination, readiness, dataset
  identity, bottom-accessory inputs, the feature renderer, and optional `extraData` for rendered
  state that is not carried by message items.
- `AssistantMessage` owns standard assistant content: the pending placeholder and structured parts.
  Its `children` render after the message body, so a feature composes its own
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
as its own file part, right after the tool result that produced it. A per-tool renderer therefore
renders the *call*, never the artifact, or the same file appears twice.

`MessageParts` lifts every file part out of the ordered stream and renders them as one
`MessageFileStrip` after the answer — the same strip `UserMessage` renders above its bubble. Two
rules hold that shape:

- **Files belong to the answer, not to the step.** A deliverable buried between two blocks of prose
  is hard to find on a phone, and the position a file was emitted at tells a reader nothing. The
  strip is the last thing in the message, so it stays put while the answer above it streams in.
- **Layout never reads `purpose`.** A file's purpose is a Runtime fact used to decide model replay,
  not a presentation input. A transcript that arrives from a peer without one must lay out
  identically, so the split keys on part type alone. Only assistant messages reach `MessageParts`
  with files, because `UserMessage` lifts its own attachments out first.

The strip carries no heading: whether a file was attached or produced follows from the role of the
message it sits in.

## Message Disclosure Contract

Interactive message parts separate their compact presentation, interaction state, and expanded
content. Tool renderers must compose these layers through the shared `MessagePart` primitives
instead of creating feature-owned rows or sheets:

| Layer | Owner | Contract |
| --- | --- | --- |
| Summary | `MessagePart.Summary` | Renders the leading icon slot, title, status text, tone, running animation, and disclosure chevron. |
| Interaction | `MessagePart.Tool` | Owns local open/close state and connects the summary press to its detail. Business renderers do not lift this transient state. |
| Detail shell | `MessagePart.Detail` | Owns the `BottomSheet`, title, dismissal, scrolling, content insets, and spacing. Tool, reasoning, and source details share this shell. |
| Detail content | The part renderer | Supplies the business-specific content inside the shell. This content remains intentionally unconstrained until its visual variants are designed. |

`MessagePart.Summary` standardizes an icon *slot*, not one icon. The slot has one size, position,
and alignment; the product adapter chooses its `icon` or `imageSource`. An image source takes
precedence over the icon component, and the wrench is only the fallback when neither is supplied.
The adapter also derives localized title and status text plus the semantic status tone. It must not
recreate the shared row geometry.

`MessagePart.Tool` is the required outer composition for generic, MCP, web-search, write-file, and
Meta tool calls. Those tool renderers remain separate while their detail semantics differ. A common
summary row is not by itself a reason to merge their business adapters. Merge adapters only when
they have the same dispatch rules, state interpretation, and detail-content contract.

Tool details open at the shared compact height and can be dragged to the shared large height. Their
reading order is outcome first and invocation arguments second. Running tools without an outcome
show their available arguments, while failures put the error before those arguments. Artifact files
stay in their own message parts and are never duplicated in the tool sheet. A successful file tool
may summarize user-facing metadata such as its filename and size, but it does not expose internal
entry ids or repeat the file body.

Reasoning and source groups retain their domain-specific compact triggers, but their expanded views
must use `MessagePart.Detail`. New interactive message parts may introduce a distinct compact
trigger only when their semantics cannot be expressed by `MessagePart.Summary`; they must not
introduce another bottom-sheet shell.

### Detail Content Status

Detail content currently accepts arbitrary React children. Raw text, structured values, source
links, and media therefore keep their existing feature-owned presentation. This is an explicit
temporary boundary, not a recommendation to create more one-off layouts.

Do not add a controlled detail-layout API until the text, structured-data, list, media, empty, and
error variants have approved visual designs. When that work begins, evolve the single
`MessagePart.Detail` boundary rather than adding parallel shells. The matching implementation TODO
lives beside `MessagePartDetail` in `packages/ui/src/components/message-part/components/message-part-disclosure.tsx`.

### Renderer Inventory And Visual Acceptance

The visible non-tool part adapters are Text, Reasoning, Code, Compact, Error, Translation, File,
Source URL/group, and Unknown. Pending is an assistant-row state rather than a persisted part
adapter. Video data, source-document, step-start, and provider-owned web-search parts intentionally
render no separate message-list content.

The tool content adapters are Generic, MCP, Web Search, Write File, Meta Search, Meta Inspect, Meta
Invoke, and Meta Exec. Painting remains a feature-owned message renderer and is not a tool-detail
variant. Count renderer families, disclosure layers, and visual states separately; combining them
into one component total obscures ownership and does not measure duplication.

Use the following Storybook stories as the visual inventory:

- `Message Parts / Tools / States` covers the shared summary slot in running, complete, and error
  states in light and dark themes.
- `Messages / Playground / Light` and `Messages / Playground / Dark` exercise the production
  message-part dispatch, including Generic, MCP, Web Search, Write File, and all Meta tool adapters.
- `Messages / Painting` separates generating, single-result, multiple-result, failed, and
  interrupted painting states.

When adding or changing an interactive renderer, add a production-shaped fixture for each relevant
state, inspect both themes on a device, open the detail, and confirm that the summary uses the shared
slot and the expanded content uses the shared shell. Follow
[`UI Development`](../../../../docs/guides/ui-development.md) and
[`Parallel Device Testing`](../../../../docs/guides/parallel-device-testing.md) for the general visual
and workspace acceptance rules.

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
└── ComposerDock
```

- The screen owns whether the message list and composer exist and passes their measured top and
  bottom insets across the list API.
- `MessageList` owns scrolling, content insets, row gutters, role-level row spacing, anchoring, and
  the placement of every rendered message. The feature renderer supplies content; it does not
  recreate list spacing.
- `UserMessage` and `AssistantMessage` own role presentation inside the row frame. They may define
  intrinsic width, internal grouping, bubbles, and surfaces, but do not add list or
  screen gutters.
- `MessageParts` owns part order and spacing. Each part renderer owns only its internal visual and
  interaction contract; it does not position sibling parts or reach into the row frame.
- Feature-owned accessories, such as the assistant toolbar, compose after the message body. Their
  spacing from the body belongs to the assistant composition, not to an individual part.
- Parent layout must not copy private child padding. Message rows keep their intrinsic measured
  height; the list does not cap a user row or reserve synthetic space around it.

Exact spacing values live in code, not this document. Changing a list gutter or row inset must have
one list-owned source; changing intrinsic message padding must update the content owner's explicit
geometry contract when list layout depends on it.

## List Behavior

`MessageList` owns its `LegendList` ref, role-based recycling types, keyboard lift, at-bottom shared
value, row frames, and the business wiring for the optional CherryUI scroll-to-bottom button.
Callers provide stable message item references and only the layout insets and callbacks they own.

One list-owned scroll controller owns product-level scroll state. It starts detached while restoring either a saved
semantic row anchor or the live edge. While following, content and viewport-size changes keep the
live edge exact. A user drag immediately enters reading mode; streaming, measurement, pagination,
and virtualizer compensation cannot pull that viewport back. Reaching the bottom, pressing the
scroll button, or sending a local message re-enters following mode. The scroll button therefore
means “return to the live edge,” not merely one untracked imperative scroll.

The controller keeps imperative mode reads in a ref for native scroll callbacks and exposes only a
reactive following boolean to button rendering. Dataset generations own drag and momentum events;
callbacks from an outgoing Session cannot transition or save state for the incoming Session.

Chat Sessions store `{ message key, offset inside the row }` in the frontend memory cache. Restore
uses `scrollToIndex`, so prepends and changing row measurements do not invalidate a raw pixel
offset. Initial reveal waits for LegendList load, history readiness, and the restore promise; it has
no quiet-time timeout. A drag that commits before restoration settles takes ownership immediately,
reveals the list, and invalidates the pending restore completion. `maintainVisibleContentPosition`
remains virtualizer-owned compensation and does not change the controller's following/reading
state.

Stateless single-turn consumers have no restoration key. They use LegendList's initial-end
bootstrap once, and the controller adopts following mode without issuing a second initial scroll.

Keyboard lift remains `whenAtEnd`: focusing the composer must not move a viewport that is reading
history. The keyboard controller is a platform geometry adapter; it never transitions the product
following/reading state. A local send uses its keyboard-aware scroll helper once so keyboard
dismissal and the animated return to the live edge share one operation.

User message rows visually separate managed file parts from the text bubble: a right-aligned,
horizontally scrollable attachment strip sits above the optional bubble. This is a presentation
projection only; files remain parts of the same message for model input, persistence, references,
and stable render identity.

## Organization

- `MessageList.tsx` is the wiring layer. `list/` owns its layout policy, viewport controller, semantic
  scroll memory, role-level row frame, interaction boundary, and dev-only instrumentation.
- `rows/` owns the intrinsic user and assistant presentation inside the list-owned row frame.
- `parts/` owns ordered part composition and adapts Cherry message schema parts into CherryUI
  primitives. `parts/tools/` owns tool dispatch and tool-specific adapters;
  `parts/tools/metaTool/` composes explicit search, inspect, invoke, and exec variants.
- `parts/tools/builtInTool/` owns shared built-in tool labels. Only its `builtInToolIcon/` family is
  platform-specific.

There are no internal barrels. Rows and adapters import private leaf modules directly; feature
callers use only this module's root entry.

## Motion

Message rows do not translate independently from the list: send positioning is one controller-owned
scroll, which avoids a second animation writing geometry during layout. Scroll-button visibility
uses the shared CherryUI motion vocabulary. Pending assistant and reasoning rows consume
`PrismSweep` from the Cherry UI loading family.
