# Selection

This module owns reusable list-selection state, controls, and layout shared by independent feature
domains.

## Public Interface

- `SelectionProvider`, `SelectionControls`, and the selection hooks coordinate registered feature
  sources and edit mode. `selectIds` replaces the selection after partial batch results.
  `SelectionProvider` automatically hides the navigation shell's compact floating dock and trailing
  vertical rail while `isEditing` is active.
- `SelectionControls` accepts feature actions alongside delete. The file library owns batch moves
  and their picker; source copy describes only the delete confirmation and failure.
- `SelectionToolbar` is the platform-specific bottom action surface for consumers that own their
  selection state. iOS uses the native bottom toolbar on iOS 18+ inside a native-stack screen, and
  falls back to the same floating `InlineSelectionToolbar` Android uses on iOS 17 and inside side
  panes. While mounted on a focused screen, `SelectionToolbar` also holds a hide registration on
  the compact floating dock and trailing vertical rail so standalone consumers never collide with
  bottom navigation chrome. It requires `allSelected` and `selectableCount` so both platforms show
  the same select-all/deselect-all action and disable it for empty lists or pending operations.
- `areAllSelected`, `toggleSelection`, and `useListBottomInset` support those custom consumers.

## Selection Mode

- Entering selection mode via `SelectionProvider` or mounting `SelectionToolbar` automatically
  hides the navigation shell's compact floating dock and trailing vertical rail while the hosting
  screen is focused, releasing the hide registration if another route covers it in the stack so
  bottom action buttons remain visible on the editing screen without hiding chrome elsewhere.
- Management pages pass `selection: { selectedCount, onExit }` to the app shell's `RouteHeader`.
  The header shows `common.selection.count` and one leading exit action, replacing normal page
  actions and custom titles. Do not add a second Done/Cancel action.
- The bottom toolbar shows `common.selection.selectAll` or `common.selection.deselectAll`, never
  a selected count as the label for an action. Features define selectable IDs, not alternate copy.
- Hide search and browse controls while management selection is active so its scope stays clear.
- Share, import, attachment, and grouped synchronization pickers retain their specific commit
  actions. A button that applies a selection is different from an action that only exits the mode.

## Organization

- `SelectionProvider.tsx` owns shared state and the feature-source registry.
- `SelectionControls.tsx` composes provider state with the toolbar and delete confirmation.
- `SelectionToolbar/` and `hooks/` remain private implementation paths behind `index.ts`.
