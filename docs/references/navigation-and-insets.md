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
- Route-level sheets are reserved for page-like flows; no current route uses one. Model selection uses a component-level BottomSheet.

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

- Normal stack back shows the correct preview.
- Nested stack back inside drawer scenes targets the correct screen.
- Modal / sheet dismissal matches platform expectations.
- Local `BackHandler` usage does not break system preview.
- Active generation, unsaved edits, and dangerous confirmations can block or confirm back correctly.

## Current Navigation Shape

- `src/app/_layout.tsx` owns the app root wrappers: gesture handler root, keyboard provider, HeroUI
  provider, `QueryProvider`, `AppBootstrapProvider`, `AppBootstrapGate`, navigation theme, bottom
  sheet provider, and the root Stack.
- The root Stack hosts the `(drawer)` group (header hidden) plus root-level `onboarding`, `topics`
  (topic management), and `paintings` screens.
- `src/app/(drawer)/_layout.tsx` owns the global drawer navigator (`expo-router/drawer`) with five
  scenes: `(chat)` (the initial route), home, assistants, drawings, and settings. The sidebar is the
  `features/sidebar` compound; every scene's header leads with a hamburger that opens it.
  `DrawerActions.openDrawer()` only reaches ancestors, so a screen that needs that hamburger has to
  be a drawer scene — which is why the drawings history lives at `/drawings` rather than under the
  root stack's `paintings` group.
- Settings is a normal nested Stack inside its drawer scene (`src/app/(drawer)/settings/`).
- The chat surface is the drawer's initial scene: `(drawer)/(chat)/index` (URL `/`) hosts its own
  nested native Stack (for `Stack.Toolbar`/`Stack.SearchBar` APIs) and wraps `ChatScreen` in
  `ChatProvider`. The provider subscribes to the app-owned Chat Runtime; route unmount does not
  dispose it.
- Route files stay thin and generally re-export feature modules from `src/frontend/features`.

## Picker Sheets

Short local pickers, such as model setting selection, use the package-owned
`@cherrystudio/ui/components` `BottomSheet` (a wrapper over
`@swmansion/react-native-bottom-sheet`'s `ModalBottomSheet`). These
sheets are plain overlays controlled by local state; their triggers should only pass open/close
and selection state.

Multi-level component sheets keep navigation history in their owning feature and render the current
page through `BottomSheet.PageTransition`. A stable `pageKey` identifies the page and `depth`
determines forward versus backward motion; the UI package owns the animation, interaction isolation,
and Reduce Motion behavior.

Model selection is a reusable component-level `ModelPickerBottomSheet`. It is used by chat input and settings/model selection, includes search, tags, grouped model rows, pinning, and an 85% snap point.

Route-level `formSheet` remains appropriate for page-like flows that need navigation history, deep linking, or system-back dismissal semantics. No current route uses it; settings is a drawer scene with its own nested stack.

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

Do not migrate model selection to a route-level `formSheet` just to reuse page navigation. Reconsider only if the picker becomes a page-like flow with nested navigation, deep linking, or system-back semantics that cannot be handled cleanly as a local sheet.

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

Current horizontal gestures, such as topic-row swipe actions, start inside content areas. The global drawer accepts a full-width open swipe (`swipeEdgeWidth` spans the screen); on Android this coexists with system edge back and must be re-validated whenever predictive back is enabled.

## Acceptance

- Android system edge back works in normal screens, nested stacks, and modal/sheet flows.
- Back targets, animations, and product confirmation states are predictable before and after enabling predictive back.
- In edge-to-edge mode, headers, chat input, and message lists are not obscured by the status bar, navigation bar, or keyboard.
- Opening model selection from chat input keeps keyboard, sheet detents, and bottom inset stable.
- Product horizontal gestures do not steal system edge back.
- Only screens with explicit product reasons use local back interception.
