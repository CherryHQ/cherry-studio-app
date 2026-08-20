import { createContext, use } from 'react';

import type { BottomSheetContextValue } from './bottom-sheet.types';

type BottomSheetRootContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

export const controlledCloseReason = 'controlled';

export const BottomSheetRootContext = createContext<BottomSheetRootContextValue | null>(null);
export const BottomSheetContext = createContext<BottomSheetContextValue | null>(null);

export function useBottomSheetRoot(): BottomSheetRootContextValue {
  const context = use(BottomSheetRootContext);

  if (!context) {
    throw new Error('BottomSheet compound components must be used inside <BottomSheet>.');
  }

  return context;
}

export function useBottomSheet(): BottomSheetContextValue {
  const context = use(BottomSheetContext);

  if (!context) {
    throw new Error('useBottomSheet must be called inside <BottomSheet.Content>.');
  }

  return context;
}
