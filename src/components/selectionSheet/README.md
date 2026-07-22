# Selection Sheet

This module owns the reusable search control for searchable selection flows.
The sheet frame itself now lives in `@/components/bottomSheet` (`BottomSheet`);
consumers compose this search field inside that frame.

## Public Interface

- `SelectionSheetSearchField` renders the shared search control.

## Organization

- `components/` contains reusable sheet UI primitives.
- `index.ts` is the public import surface.
