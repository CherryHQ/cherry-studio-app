import { createContext, use } from 'react';
import type { EdgeInsets } from 'react-native-safe-area-context';

// A close can carry an intent so the owner can act on it once the closing
// animation settles (e.g. the painting template's "use" flow). `'dismiss'` is
// the default for the close button and every gesture / scrim collapse.
export type BottomSheetCloseReason = 'controlled' | 'dismiss' | (string & {});

/**
 * The owner set `isOpen` to false; the user did not close anything. Owners that
 * remember a dismissal have to tell the two apart, or closing a sheet from code
 * counts as the user waving it away.
 */
export const controlledCloseReason = 'controlled';

export type BottomSheetGeometry = {
  // Bottom corner radius of the floating card, concentric with the display's
  // own corner; bodies align their own bottom panels to it by subtracting their
  // inset from the card (`bottomCornerRadius - inset`).
  bottomCornerRadius: number;
  insets: EdgeInsets;
  // Card width = window width minus the outer inset on both sides.
  sheetWidth: number;
  // Top corner radius of the floating card — the resting radius on every
  // device, since the top corners touch no screen edge.
  topCornerRadius: number;
};

export type BottomSheetContextValue = {
  geometry: BottomSheetGeometry;
  // True once a close has been requested (and while the card is settling shut),
  // so body actions can disable themselves during the exit animation.
  isClosing: boolean;
  requestClose: (reason?: BottomSheetCloseReason) => void;
};

export const BottomSheetContext = createContext<BottomSheetContextValue | null>(null);

export function useBottomSheet(): BottomSheetContextValue {
  const context = use(BottomSheetContext);
  if (!context) {
    throw new Error('useBottomSheet must be called inside a <BottomSheet>.');
  }
  return context;
}
