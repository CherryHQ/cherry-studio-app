# Confirm Dialog

This module owns the shared destructive-action confirmation dialog used across screens.

## Public Interface

- `useConfirmDialog` returns the dialog element and the action used to request confirmation.
- Callers import from `@/frontend/components/confirmDialog`.

## Organization

- `hooks/` owns dialog state and composes the shared dialog UI.
- `index.ts` is the public import surface.
