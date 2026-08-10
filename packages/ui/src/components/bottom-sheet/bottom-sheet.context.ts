import { createContext, use } from 'react';

import type { BottomSheetContextValue } from './bottom-sheet.types';

export const controlledCloseReason = 'controlled';

export const BottomSheetContext = createContext<BottomSheetContextValue | null>(null);

export function useBottomSheet(): BottomSheetContextValue {
  const context = use(BottomSheetContext);

  if (!context) {
    throw new Error('useBottomSheet must be called inside a <BottomSheet>.');
  }

  return context;
}
