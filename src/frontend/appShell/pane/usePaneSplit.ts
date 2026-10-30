import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  resolveFilePaneWidth,
  resolvePaneSplit,
  useFoldRegionLayout,
  useIsFoldRegionLayoutCurrent,
} from '@/frontend/appShell/layout';

const UNMEASURED_HOST = { height: 0, width: 0 };

/** The host's fold snapshot sizes the split; until it arrives the pane reserves no space. */
export function usePaneSplit() {
  const layout = useFoldRegionLayout();
  const isLayoutCurrent = useIsFoldRegionLayoutCurrent();
  const insets = useSafeAreaInsets();
  const host = layout?.host ?? UNMEASURED_HOST;
  // The host is already beside any persistent sidebar; never subtract the sidebar twice.
  const paneWidth = resolveFilePaneWidth(host.width - insets.left - insets.right);
  const split = resolvePaneSplit({ fold: layout?.fold ?? null, host, paneWidth });
  // The host starts at the window's top edge, so its offsets are window coordinates.
  const chatTop = split.direction === 'column' ? split.chatOffset : null;

  return { chatTop, insets, isLayoutCurrent, split };
}
