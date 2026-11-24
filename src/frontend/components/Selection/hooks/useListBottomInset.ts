import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNavigationDockClearance } from '@/frontend/appShell/navigationShell/state';

import { selectionToolbarGap, selectionToolbarHeight } from '../selectionToolbarLayout';

// Selection-capable lists sit above the selection toolbar in edit mode and clear
// the compact floating dock on navigation roots. We return ONE static inset that
// never changes across the edit⇄done toggle so the list stays put instead of reflowing.
export function useListBottomInset(): number {
  const insets = useSafeAreaInsets();
  const dockClearance = useNavigationDockClearance();

  return insets.bottom + selectionToolbarHeight + selectionToolbarGap * 2 + dockClearance;
}
