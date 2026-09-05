import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { selectionToolbarGap, selectionToolbarHeight } from '../selectionToolbarLayout';

// Selection-capable lists sit above the selection toolbar in edit mode. We
// return ONE inset that clears the toolbar and never changes across the
// edit⇄done toggle, so the list content stays put instead of reflowing — the
// value is independent of `isEditing`, letting callers keep a stable
// contentContainerStyle reference.
export function useListBottomInset(): number {
  const insets = useSafeAreaInsets();

  return insets.bottom + selectionToolbarHeight + selectionToolbarGap * 2;
}
