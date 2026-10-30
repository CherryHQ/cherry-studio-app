import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useChatHeaderHeight } from '@/frontend/appShell/layout';
import { appSidebar } from '@/frontend/utils/constants';

// Native toolbar controls center this far above the bottom of an iOS header that keeps its own
// top margin, measured on an iPhone Duo's inner display.
const NATIVE_CONTROL_CENTER_FROM_HEADER_BOTTOM = 34;

/**
 * Top of the sidebar's title row, level with the chat header's controls. A header normally starts
 * below the top safe area. On an iPhone Duo's inner display it does not: upright, the header fills
 * the top inset itself; on its side the inset is zero and the header keeps its own top margin.
 */
export function useSidebarHeaderTop() {
  return resolveSidebarHeaderTop(useSafeAreaInsets().top, useChatHeaderHeight());
}

export function resolveSidebarHeaderTop(top: number, chatHeaderHeight: number) {
  const isHeaderInTopInset = chatHeaderHeight > 0 && (top === 0 || chatHeaderHeight <= top);

  return isHeaderInTopInset
    ? chatHeaderHeight - NATIVE_CONTROL_CENTER_FROM_HEADER_BOTTOM - appSidebar.headerRowHeight / 2
    : top + appSidebar.headerGapY;
}
