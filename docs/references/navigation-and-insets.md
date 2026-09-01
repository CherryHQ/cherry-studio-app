# Navigation And Insets

This reference defines Cherry Studio Mobile navigation gestures, Android predictive back,
edge-to-edge layout, and safe-area/inset strategy. Terms follow
[Domain Language](./domain-language.md).

## Principles

- Android edge back is a platform-native capability. Cherry Mobile does not simulate edge-swipe back in JavaScript.
- Expo Router `Stack` / React Navigation native-stack bridges native screen stacks and back animations through `react-native-screens`.
- Edge-to-edge is a platform window layout capability. The app is responsible for fitting headers, chat input, message lists, sheets, and keyboard areas against insets.
- System gesture zones belong to the system. Product horizontal gestures must not compete with Android screen edges.
- Back interception is limited to explicit product states such as unsaved edits, active generation confirmation, or dangerous action confirmation.
- The target priority and cancellation rules between system gestures, scrolling, app-defined pan,
  long press, tap, and text selection are in
  [Interaction And Gesture Arbitration](./interaction-and-gesture-arbitration.md) (`Status: design`).
- Route-level sheets are reserved for page-like flows; no current route uses one. Every model
  selection entry uses `ModelPickerDrawer`, including its in-place search.

## Android Back Gesture

Left/right edge back on Android devices is handled by system navigation gestures. Cherry Mobile only declares navigation structure and screen options:

```tsx
<Stack
  screenOptions={{
    headerShown: false,
  }}
/>
```

Back navigation should use the native stack. Do not add a global `PanGestureHandler` or custom full-screen back gesture on Android just to imitate iOS interactive pop.

## Predictive Back

Android predictive back preview is a system capability, not an app-drawn animation. Expo exposes it through:

```json
{
  "expo": {
    "android": {
      "predictiveBackGestureEnabled": false
    }
  }
}
```

For v1, keep `false` as the conservative default. Enable it after navigation structure, modal behavior, unsaved state, and active generation state are stable, then validate on real devices.

Before enabling it, verify:

- Normal root-stack and nested feature-stack back shows the correct preview.
- Returning from a root-pushed feature screen targets the chat surface.
- Modal / sheet dismissal matches platform expectations.
- Local `BackHandler` usage does not break system preview.
- Active generation, unsaved edits, and dangerous confirmations can block or confirm back correctly.

## Current Navigation Shape

- `src/app/_layout.tsx` owns the app root wrappers: gesture handler root, keyboard provider, HeroUI
  provider, `QueryProvider`, `AppBootstrapProvider`, `AppBootstrapGate`, navigation theme, bottom
  sheet provider, and the root Stack.
- The root Stack hosts the `(drawer)` group (header hidden) plus root-level `home`, `library`,
  `agents`, `drawings`, `onboarding`, `search`, `sessions` (Agent Session management), `settings`,
  and `paintings` flows. Directories with their own nested Stack hide the root header and draw the
  feature header inside that nested Stack.
- `src/app/(drawer)/_layout.tsx` owns the global drawer navigator (`expo-router/drawer`) and contains
  only the `(chat)` scene. The chat header is therefore the only header that can open the sidebar,
  and the full-width drawer gesture exists only on the chat surface.
- The sidebar is the `features/sidebar` compound. Its destinations close the drawer and push
  `library`, `agents`, `drawings`, `sessions`, or `settings` onto the root Stack. Their root
  headers lead with back; popping returns to the exact chat route that opened them. A cold-start
  deep link with no back history replaces to `/` when that leading action is pressed.
- Settings is a normal root-stack card with its own nested Stack, not a modal or form sheet. Its
  root and child screens use back navigation like every other non-chat feature flow.
- The chat surface is the drawer's initial scene: `(drawer)/(chat)/index` (URL `/`) hosts its own
  nested native Stack (for `Stack.Toolbar` APIs) and wraps `ChatScreen` in `ChatProvider`. The
  provider observes the app-owned Mobile Agent Host through `Backend.agent`; route unmount removes
  the frontend observation but does not cancel the Host's active turn.
- Route files stay thin and generally re-export feature modules from `src/frontend/features`.

## Page Identity And Cached Data

Every route-bound entity or semantic selection defines a complete page identity, such as a
Provider id, Agent id, Session id, or usage date. Route parameters are parsed before content renders,
and query keys include that complete identity even while their observers are disabled.

When identity changes on a reused route instance, local forms, search text, filters, pending actions,
and other entity-owned state reset through a keyed component boundary. Data from a different
identity must not be used as placeholder data. Cached data for the same identity may render while it
refreshes in the background when that product surface permits stale-while-revalidate behavior.

## Chat Identity Contract

The chat route has two complete identities:

- A Session is `{ kind: 'session', sessionId }`.
- A draft is `{ kind: 'draft', agentId }`.

Every in-app entry constructs one of these targets through `chatHref` or `chatRouteParams`. A
Session link carries only `sessionId`; the destination reads the Session entity to derive its Agent
for presentation and composer behavior. Drafts have no Session entity yet, so `agentId` is their
complete route identity. If a Session no longer exists, the destination shows a loading state while
it requests the globally most recently active Session, then replaces the missing identity with that
result. If no Session remains, it uses the same draft or no-Agent fallbacks as an identity-free
launch.

Opening `/` without an identity restores the globally most recently active Session ordered by its
persisted `lastActivityAt`. If no Session exists, it opens a draft for the first available Agent,
then the no-Agent empty state. Restoration renders a loading state, never a previous identity's
content or the no-Agent empty state as a loading placeholder. Every restoration performs a fresh
one-row Session request; an earlier result is never used to choose the destination.

| Entry | Destination |
| --- | --- |
| Sidebar or Session-list Session row | That Session id |
| Sidebar dock or chat-header new-chat action | Draft for the current available Agent, otherwise the first Agent |
| Agent-list row | That Agent's editor |
| Chat-header Agent picker row | A new draft for the selected Agent |
| Chat-header history action | `/sessions?agentId=<current Agent>` |
| Assistant-message fork | The returned fork Session id |

The Agent list manages Agent definitions; the transient header picker changes the Agent for a new
draft. Keep those responsibilities distinct when adding future Agent entry points.

Correctness belongs to the destination screen and its query/local-state identity. Press-time
prefetching may improve latency, but navigation must not wait behind a global coordinator or route
guard.

## Picker Sheets

Short, single-level local pickers use the package-owned
`@cherrystudio/ui/components` `BottomSheet`, a focused wrapper over
`@swmansion/react-native-bottom-sheet`'s `ModalBottomSheet`. It owns the drag handle, title,
scrim, card geometry, safe areas, swipe/scrim dismissal, Android back, and accessibility escape.
Feature-level picker components pass their content into this shell, while screen callers only pass
open/close and selection state.

The card keeps a four-point inset from both screen edges and the bottom edge. Its bottom corners use
the larger of the 28-point card radius or the display radius minus that inset, keeping rounded-screen
geometry concentric without exposing device geometry to feature code.

Component sheets use the shared `compact`, `medium`, `large`, and `full` height specs (40%, 60%,
80%, and 100% of available height). Features choose or dynamically switch the semantic size; they
do not calculate screen height or pass native detents.

Multi-level component sheets keep their current page in the owning feature and replace their content
inside the same physical sheet. They pass `backAction` only while a nested page is visible; the
shared shell owns the consistent header placement but does not expose a navigation stack.

Agent editing, painting input, provider connectivity checks, and model settings all open
`ModelPickerDrawer`, the one model-selection view. Its search field filters the grouped catalog in
place. Focusing search expands the sheet from `large` to `full`; a non-empty query keeps it expanded
after the keyboard is dismissed, and clearing an unfocused search restores `large`.

The app has two search shapes, and which one a screen takes follows from where the answer lives.

A screen that already holds everything it can match keeps its search in place, through
`components/inlineSearch`. The field sits between the screen's `RouteHeader` and its content: iOS
mounts `Stack.SearchBar` with `placement="stacked"`, giving it a row under the title, while Android
draws CherryUI's `SearchField` in that same spot. Android's own header search bar exists but arrives
as a toolbar menu item, pinned right of the screen's actions and styled by the platform rather than
by CherryUI, so it is deliberately not used. Agent list, model-service list, and MCP server list are
all this shape.

Search that has to leave the screen to find its answer — because results are paginated server-side,
carry filters, or are not the rows the screen already draws — uses the root `/search` route. It is
one fixed view: callers adapt data, matching, optional filters, and result content rather than
supplying business-specific search screens. Native back or an interactive pop cancels without
calling business logic; selection resolves only after the route's exit transition completes. The
route title is always Search, and it does not query or render a full result set until the user
enters non-whitespace text. Session search and provider model search are this shape.

The two share their matching rules through `frontend/utils/search`, which is keyword-based: a query
splits on whitespace and every keyword has to appear across an item's searchable fields. They share
nothing else. Provider model pull keeps its own local search because its matching rows retain
management and multi-selection actions that neither shape models.

Route-level sheets remain appropriate for page-like flows that need navigation history, deep
linking, or system-back dismissal semantics. No current flow uses one: Settings is a normal
root-stack card with a nested Stack, while local pickers use the shared component sheet.

Reach for `presentation: 'modal'` rather than `'formSheet'` unless you actually need detents. On iOS both present as a page sheet, but with `formSheet` (`react-native-screens` 4.25) the sheet's content view comes up offset upward by the height of its own first child. A full-height first child — a `flex: 1` scroll view, say — is then entirely off screen, and the page looks empty apart from whatever is absolutely positioned. Fast Refresh re-lays-out the sheet and hides the bug, so verify this kind of screen from a cold start.

Recommended shape:

```tsx
<Stack.Screen
  name="provider-picker"
  options={{
    presentation: 'formSheet',
    sheetAllowedDetents: [0.5, 0.9],
    sheetInitialDetentIndex: 0,
    sheetCornerRadius: 24,
  }}
/>
```

Do not present app search as a route-level `formSheet`; it is a normal root stack card so entry,
selection dismissal, and platform back gestures share one transition contract.

## Component Sheet Boundary

Component-level bottom sheets are only for local, short-lived panels that do not need navigation history, such as a few quick actions, local filters, or temporary action menus.

Do not add more growing pickers as JavaScript bottom sheets unless the flow explicitly does not need system back preview, deep linking, page-like dismissal semantics, or navigation history. JS sheets usually need their own `BackHandler`, which weakens Android predictive back continuity.

## Edge-to-Edge And Insets

Android edge-to-edge should not be avoided by pinning a system navigation bar background color. Cherry Mobile must handle layout explicitly:

- Top headers avoid the status bar inset.
- Chat input handles both bottom inset and keyboard inset.
- Message list `contentContainerStyle` leaves room for chat input and bottom inset.
- Full-screen pages, image previews, modals, and sheets explicitly choose whether they draw behind system bars.
- Sheets opened from chat input should not leave keyboard, bottom inset, and sheet detents fighting each other.

## Gesture Conflict Boundaries

- Do not place product gestures that require horizontal swiping on the left/right screen edge.
- Drawers, message swipe actions, carousels, and media scrubbers should start from content areas, not the system edge zone.
- If a page must use an edge horizontal gesture, validate on Android that system back remains intact.
- iOS interactive pop and Android system back are not the same product contract; do not flatten them into one JavaScript gesture.

Current horizontal gestures, such as Session-row swipe actions, start inside content areas. The
chat-only drawer accepts a full-width open swipe (`swipeEdgeWidth` spans the screen); non-chat
routes live above it in the root Stack and cannot expose it. On Android, the chat gesture still
coexists with system edge back and must be re-validated whenever predictive back is enabled.

## Acceptance

- Android system edge back works in normal screens, nested stacks, and modal/sheet flows.
- Back targets, animations, and product confirmation states are predictable before and after enabling predictive back.
- Only the chat route exposes the sidebar button and full-width drawer gesture; every other route
  exposes back and returns to chat.
- In edge-to-edge mode, headers, chat input, and message lists are not obscured by the status bar, navigation bar, or keyboard.
- Opening model selection from chat input keeps the picker stable; focusing or clearing in-place
  search changes the sheet size without a competing route, back handler, or inset jump.
- Product horizontal gestures do not steal system edge back.
- A scroll that begins on an interactive row does not also navigate, open a contextual menu, or
  start native text selection.
- Only screens with explicit product reasons use local back interception.
