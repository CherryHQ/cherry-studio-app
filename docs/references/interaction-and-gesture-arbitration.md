# Interaction And Gesture Arbitration

> Status: design
>
> This document defines the target interaction contract. Conformance must be verified at each
> implementation boundary.

This reference defines how Cherry Studio Mobile distinguishes tap, long press, scrolling,
app-defined pan gestures, system gestures, and native text selection. It is written for both people
reviewing interaction behavior and agents changing UI code. It does not inventory feature-specific
behavior, affected components, or current implementation gaps; track those in the relevant issue,
implementation plan, or component documentation.

[UI Components](./ui-components.md) owns component and platform boundaries.
[Navigation And Insets](./navigation-and-insets.md) owns navigation gestures and system edges.
[Design Spec](../../DESIGN.md) owns visual and motion semantics. This document owns what happens
when multiple interactions are eligible for the same touch sequence.

## Interaction Contract

The same user intent has the same semantic result on iOS and Android even when different platform
APIs recognize or present it.

For a vertically scrolling row with a contextual menu, the contract is:

| Intent | Required result |
| --- | --- |
| Tap without material movement | Activate the row or control once |
| Stationary long press | Open the contextual menu once |
| Vertical drag | Scroll; do not activate the row or open its menu |
| Horizontal app-defined drag | Run the documented app gesture; do not tap or long press |
| Touch during momentum | Stop or take control of scrolling; do not activate the touched row from the same sequence |
| System-edge gesture | Yield to the operating system |
| Accessibility action | Invoke the named semantic action without requiring a gesture |

Platform-native presentation may differ. Eligibility, cancellation, action meaning, and semantic
results may not.

## Terms

- **Candidate**: an interaction that might still win the current touch sequence.
- **Committed**: the one interaction that has won and may produce its semantic action.
- **Cancelled**: an interaction that must remain inert until the next touch sequence.
- **Touch slop**: the platform-provided movement tolerance before a stationary press becomes a
  drag. Read it from the platform recognizer or configuration; do not invent a component-local
  pixel value.
- **Drag**: direct pointer movement after the relevant axis crosses its recognition threshold.
- **Momentum**: scrolling that continues after the pointer is released.
- **System gesture zone**: the screen-edge region owned by operating-system navigation.

## Arbitration Order

Protect eligible interactions in this order:

1. Operating-system gestures and system-rendered modal interaction.
2. An already committed direct manipulation, such as scrolling, a sheet drag, a slider drag, or an
   app-defined swipe.
3. A stationary long press that reaches the platform long-press timeout without exceeding touch
   slop or receiving cancellation.
4. A tap that ends inside its target without any higher-priority interaction committing.

This is an arbitration order, not a z-index. A lower-priority candidate remains possible only
while every higher-priority candidate has either not committed or explicitly failed.

### Touch Sequence

Every touch target that combines these interactions follows the same state model:

```text
idle
  -> pointer down: tap candidate + optional long-press candidate
  -> movement crosses vertical threshold: scrolling commits; tap and long press cancel
  -> movement crosses eligible horizontal threshold: app-defined pan commits; tap and long press cancel
  -> stationary timeout: long press commits; tap cancels
  -> pointer up inside threshold before timeout: tap commits
  -> parent intercept / system cancel / unmount: every candidate cancels
  -> pointer up or cancel after a committed interaction: return to idle without another action
```

Cancellation is sticky for that sequence. A drag that cancels a press cannot later produce a tap
when the finger lifts.

If the long press commits before the user begins moving, opening the menu is expected: the later
movement belongs to the committed menu interaction. False activation means the parent had already
recognized or cancelled for scrolling, or movement had already exceeded touch slop, yet the menu
or tap still fired.

## Shared Responsibilities

### Scroll Surface

The scroll owner is the authority on drag and momentum state. It must:

- allow descendants to receive an initial pointer-down candidate;
- cancel descendant tap, long-press, selection, and row-swipe candidates when vertical scrolling
  commits;
- preserve cancellation through pointer-up;
- treat a touch that only stops active momentum as scroll control rather than row activation; and
- expose scroll interaction state at a shared boundary when the native event stream does not
  deliver sufficient cancellation to descendants.

Do not make each row independently infer whether its parent is scrolling. The list or a shared
interaction boundary owns that fact.

### Tap Control

A button, row, link, or icon action commits on release, not on pointer down. It must not fire when:

- the pointer leaves the allowed press region;
- movement commits a parent or sibling pan;
- a long press commits;
- the operating system cancels the sequence; or
- the first touch is consumed to stop momentum.

Pressed styling is feedback for a candidate, not proof that the action will run. It clears on
cancellation.

### Long-Press Menu

A contextual menu keeps the child target's ordinary tap behavior until the long press commits. It
must:

- use the platform long-press timeout and touch slop unless a documented interaction requirement
  says otherwise;
- cancel on movement beyond touch slop, parent interception, system cancellation, unmount, or
  disabled state;
- cancel the child tap exactly when the menu commits;
- open at most one menu for one touch sequence; and
- never open while the owning list reports drag or momentum interaction.

The public component contract must express whether menu recognition is enabled. Call sites must
not reach into an iOS or Android menu SDK to implement cancellation themselves.

### Text Selection And Copy

Whole-content copy and partial text selection are different interactions:

- **Whole-content copy** is an explicit semantic action. The owning surface determines the copy
  projection, including which rendered or hidden parts are included.
- **Partial selection** is a native text interaction. The system owns handles and the selection
  menu, while the owning surface controls where selection is enabled.

Making all rendered text selectable is not a neutral default inside a scroll surface: on Android it
adds a long-press recognizer through the native text view. A shared text component therefore needs
an explicit selection policy rather than enabling selection unconditionally.

When partial selection cannot obey the scroll arbitration contract on a platform or renderer, keep
the explicit whole-content copy action available and disable partial selection for that surface.
Do not ship a selection interaction that opens while the user is scrolling merely to preserve
source parity with the other platform.

### App-Defined Pan And Row Swipe

A component that combines a vertical list with a horizontal app-defined gesture must establish an
axis before committing:

- vertical intent yields to the list;
- horizontal intent may commit only after crossing its platform-appropriate threshold;
- ambiguous diagonal movement stays uncommitted until an axis wins, then cancels the losing
  candidates; and
- neither direction begins in a system gesture zone unless the operating system or navigation
  owner provides that gesture.

System back is never implemented as a row or screen pan. See
[Navigation And Insets](./navigation-and-insets.md#gesture-conflict-boundaries).

## Platform Responsibilities

### iOS

- Prefer system-owned `UIContextMenuInteraction`, Expo Router `Link.Menu`, native navigation
  gestures, and native text selection where they fit the semantic contract.
- Let the system coordinate a context menu with its preview, scroll ancestors, cancellation, and
  accessibility behavior. Do not reproduce a system context menu in JavaScript to match Android
  source structure.
- An iOS preview is progressive presentation. Preview availability does not change action meaning
  or make a long press eligible after scrolling has committed.
- Interactive pop belongs to native-stack navigation and outranks app-defined gestures in the
  system edge zone.

### Android

- `PopupMenu` presents actions but does not recognize the trigger gesture. The app-owned adapter
  is responsible for long-press timing, touch-slop cancellation, parent-scroll cancellation, and
  React Native responder coordination before showing it.
- Read long-press timeout and touch slop from Android `ViewConfiguration` or a platform recognizer.
  Do not copy iOS timing or use density-independent constants as a substitute.
- Native text selection uses Android selection ActionMode. Enabling `setTextIsSelectable(true)`
  introduces long-press behavior that must still yield to its scroll ancestor.
- Android system back and predictive back belong to navigation. A component menu or row swipe must
  not claim an edge sequence intended for back.

### Shared Semantic Layer

The shared layer owns labels, roles, enabled state, action identity, destructive meaning, and the
arbitration result. Private platform adapters own native recognition and presentation details.

Do not expose `UIMenu`, `PopupMenu`, gesture-handler, or native text-view types through feature APIs.
Do not fork color, spacing, typography, row geometry, or semantic actions by platform to compensate
for a gesture problem.

## Common Scenarios

### Selectable Content In A Scroll Surface

- Vertical scrolling outranks native text selection, link long press, and other descendant actions.
- Explicit whole-content copy and partial native selection are separate interactions. A surface
  that offers either one must document its copy projection or selection policy.
- Partial selection may be enabled only when the active renderer obeys scroll cancellation on that
  platform.
- Alternate renderers for the same content must expose the same cancellation behavior.
- A link tap opens the link only after a valid tap sequence. Moving beyond touch slop cancels both
  link tap and link long press.

### Interactive Rows In A Scrollable List

- Tap runs the row's documented primary action when the row is not in selection/editing mode.
- Stationary long press opens the row's documented contextual actions.
- Vertical drag scrolls without navigating or opening a menu.
- Selection/editing mode replaces navigation and contextual-menu behavior with the documented
  selection action.
- Accessibility custom actions expose the same contextual operations without depending on long
  press.

### Sheets, Drawers, And Navigation

- System back, native interactive pop, and accessibility escape follow the navigation contract.
- A sheet drag that commits cancels taps and long presses in the dragged touch sequence.
- Content scrolling inside a sheet must not accidentally dismiss it; the sheet and content scroller
  negotiate through the maintained sheet primitive rather than feature-local responders.
- Drawer and row-swipe gestures do not take ownership of Android system-edge back sequences.

## Development Workflow

Before creating or substantially changing an interactive component:

1. List every eligible interaction on the same touch target and its parent scroll or navigation
   owners.
2. Write the expected outcome for tap, stationary long press, movement before timeout, parent
   interception, momentum touch, cancellation, disabled state, and accessibility activation.
3. Choose the narrowest shared owner that can arbitrate the competing interactions.
4. Delegate system-rendered presentation to the platform adapter without changing the shared
   semantic result.
5. Add behavior-neutral native diagnostics when event ordering is uncertain; do not infer gesture
   order from JavaScript callbacks alone.
6. Verify the acceptance matrix on both platforms for any changed native or cross-platform gesture
   boundary.

Do not fix a shared gesture conflict with screen-specific timeouts, arbitrary movement constants,
duplicate long-press handlers, or a platform check in feature code.

## Acceptance Matrix

For a row that supports tap, long press, and vertical scrolling, verify at minimum:

| Scenario | Required result |
| --- | --- |
| Quick tap | One tap action; no menu |
| Stationary hold past system timeout | One menu; no tap action |
| Quick vertical flick starting on the target | Scroll; no tap and no menu |
| Slow vertical drag crossing touch slop before timeout | Scroll; no tap and no menu |
| Small movement inside touch slop followed by release | One tap action |
| Small movement inside touch slop held past timeout | One menu |
| Diagonal movement resolved as vertical | Scroll; no row action |
| Parent intercept or system cancellation | No action |
| Touch while list has momentum | Stop or take control of scroll; no row action from that touch |
| Long press followed by release | Menu remains the only committed interaction |
| Accessibility named action | The named action runs once without requiring touch timing |

For selectable text inside a scroll surface, add:

| Scenario | Required result |
| --- | --- |
| Stationary long press on selectable text | Native selection begins when enabled |
| Vertical drag beginning on text | Scroll; no selection menu |
| Drag after selection has already committed | Adjust selection or follow platform selection behavior; do not activate the row |
| Whole-content copy action | Copies the documented projection without requiring text selection |

Run native gesture acceptance on a device or simulator. JavaScript rendering tests alone cannot
prove recognizer timing, `ACTION_CANCEL`, parent interception, platform text selection, or system
gesture behavior.
