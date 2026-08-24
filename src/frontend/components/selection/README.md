# Selection

This module owns reusable list-selection state, controls, and layout shared by independent feature
domains.

## Public Interface

- `SelectionProvider`, `SelectionControls`, and the selection hooks coordinate registered feature
  sources and edit mode.
- `SelectionToolbar` is the platform-specific bottom action surface for consumers that own their
  selection state.
- `areAllSelected`, `toggleSelection`, and `useListBottomInset` support those custom consumers.

## Organization

- `SelectionProvider.tsx` owns shared state and the feature-source registry.
- `SelectionControls.tsx` composes provider state with the toolbar and delete confirmation.
- `SelectionToolbar/` and `hooks/` remain private implementation paths behind `index.ts`.
