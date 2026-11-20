import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  resolveFilePaneWidth,
  resolvePaneSplit,
  useFoldRegionLayout,
  useIsFoldRegionLayoutCurrent,
} from '@/frontend/appShell/layout';

const UNMEASURED_HOST = { height: 0, width: 0 };

/** A pane taking the sidebar's column immediately occupies the whole window. */
export function usePaneSplit(scope: 'host' | 'window') {
  const layout = useFoldRegionLayout(scope);
  const isLayoutCurrent = useIsFoldRegionLayoutCurrent(scope);
  const insets = useSafeAreaInsets();
  const host = layout?.host ?? UNMEASURED_HOST;
  const paneWidth = resolveFilePaneWidth(host.width - insets.left - insets.right);
  const split = resolvePaneSplit({ fold: layout?.fold ?? null, host, paneWidth });
  // The host starts at the window's top edge, so its offsets are window coordinates.
  const chatTop = split.direction === 'column' ? split.chatOffset : null;

  return { chatTop, insets, isLayoutCurrent, split };
}
