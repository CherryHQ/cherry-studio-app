import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import { resolveWindowClass, type WindowClass, windowRegionBodyTextSize } from './windowClass';

/** Resolves the window class from the window, its safe area, and the rendered body text size. */
export function useWindowClass(): WindowClass {
  const { fontScale, width } = useWindowDimensions();
  const { left, right } = useSafeAreaInsets();
  // The app's text-size setting rewrites this variable; the system text size scales it again.
  const bodyTextSize = Number.parseFloat(String(useCSSVariable('--ui-text-base')));
  const appTextScale = Number.isFinite(bodyTextSize) ? bodyTextSize / windowRegionBodyTextSize : 1;

  return resolveWindowClass({
    insetLeft: left,
    insetRight: right,
    textScale: appTextScale * fontScale,
    width,
  });
}

/**
 * Wide windows have room for the sidebar as a column beside the content instead of an overlay. The
 * sidebar decides whether the column is showing.
 */
export function useCanDockSidebar() {
  return useWindowClass() === 'wide';
}
