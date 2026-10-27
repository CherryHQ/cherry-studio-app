import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  resolveFilePaneWidth,
  resolvePaneSplit,
  useFoldRegionLayout,
  useIsFoldRegionLayoutCurrent,
} from '@/frontend/appShell/layout';

/** The native snapshot owns every split input; hosts without it use their local layout size. */
export function usePaneSplit() {
  const layout = useFoldRegionLayout();
  const isLayoutCurrent = useIsFoldRegionLayoutCurrent();
  const fallbackInsets = useSafeAreaInsets();
  const [fallbackHost, setFallbackHost] = useState({ height: 0, width: 0, x: 0, y: 0 });
  const measure = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setFallbackHost((current) =>
      current.width === width && current.height === height
        ? current
        : { height, width, x: 0, y: 0 },
    );
  }, []);

  const host = layout?.host ?? fallbackHost;
  const insets = layout?.insets ?? fallbackInsets;
  // The host is already beside any persistent sidebar; never subtract the sidebar twice.
  const paneWidth = resolveFilePaneWidth(host.width - insets.left - insets.right);
  const split = resolvePaneSplit({ fold: layout?.fold ?? null, host, paneWidth });
  const chatTop = split.direction === 'column' ? host.y + split.chatOffset : null;

  return { chatTop, insets, isLayoutCurrent, measure: layout ? undefined : measure, split };
}
