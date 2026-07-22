# bottomSheet

Shared "floating card" bottom sheet — the single styled frame every sheet in the
app uses so they share one silhouette: inset from the screen edges, a concentric
bottom corner radius that curves around the home indicator, a circular close
button nested into the top-left corner, a centered title, and a liquid-glass (or
solid) surface. Built on `@swmansion/react-native-bottom-sheet`'s
`ModalBottomSheet`. Chrome constants live in `src/config/constants.ts`
(`bottomSheet`, `sheetScrimColor`, `isLiquidGlassAvailable`).

## Usage

```tsx
import { BottomSheet, useBottomSheet } from '@/components/bottomSheet';

function MySheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="My sheet" testID="my-sheet">
      {/* body owns its own scroll / layout */}
    </BottomSheet>
  );
}
```

The frame renders the header (close button + title + balancing right slot), the
glass/solid surface, and the safe-area bottom gap. The body is `children`.

## Props

- `isOpen?` — controlled open state (default `true`, so a conditionally-mounted
  sheet just opens on mount). Toggle it to close, or call `requestClose` from the
  body.
- `onClose(reason)` — fires **once**, after the closing animation settles. The
  close button and every gesture / scrim collapse pass `'dismiss'`; a body action
  can pass its own reason (e.g. `'use'`) via `requestClose('use')`.
- `title?` — a string is rendered with the standard centered title style; pass a
  node when the title needs its own testID or markup.
- `height?` — fixes the inner card height (for tall list/picker sheets); omit to
  size the card to its content.
- `isCloseDisabled?` — disables the close button and blocks gesture / scrim
  dismissal while a blocking task owns the sheet (e.g. a running check).
- `headerRight?` — optional right-header slot (defaults to a balancing spacer).
- `closeAccessibilityLabel?`, `testID?`.

## `useBottomSheet()`

Available to any body descendant. Returns:

- `requestClose(reason?)` — start the closing animation; `onClose(reason)` fires
  when it settles. Use this for "close then act" flows.
- `isClosing` — `true` once a close is in flight, so body actions can disable
  themselves during the exit.
- `geometry` — `{ insets, sheetWidth, bottomCornerRadius, topCornerRadius }` for
  aligning inner panels concentrically with the card.

## Derived testIDs

From the `testID` prefix: `-sheet` (card), `-sheet-surface`, `-sheet-bottom-gap`,
`-header`, `-close` (button), `-close-glass` (glass wrapper, liquid-glass only).
