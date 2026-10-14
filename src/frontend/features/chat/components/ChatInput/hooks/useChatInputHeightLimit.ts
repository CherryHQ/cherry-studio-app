import { getComposerTextMaxHeight } from '@cherrystudio/ui/components';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useWindowDimensions } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResolveClassNames } from 'uniwind';

import { mainHeaderRowHeight } from '@/frontend/appShell/header';
import { useChatDockFooterHeight } from '@/frontend/appShell/layout';
import { resolveHeaderContentInset } from '@/frontend/appShell/navigation';

/** The window is stable while this app's keyboard provider lifts the dock above the IME. */
export function useChatInputHeightLimit(
  minTextHeight: number,
  reservedContentHeight: number,
  keyboardTrackingEnabled: boolean,
) {
  const { height: windowHeight, fontScale } = useWindowDimensions();
  const { fontSize = 16 } = useResolveClassNames('text-(length:--text-base)');
  const { top, bottom } = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const footerHeight = useChatDockFooterHeight();
  // Will-show carries the target height; did-hide clears it. Do not resize the
  // editor for every frame of the keyboard animation or for every keystroke.
  const keyboardHeight = useKeyboardState((state) => (state.isVisible ? state.height : 0));
  const topInset = resolveHeaderContentInset(headerHeight, top + mainHeaderRowHeight);
  const availableHeight = Math.max(
    0,
    windowHeight - topInset - (keyboardTrackingEnabled ? keyboardHeight : 0),
  );

  return getComposerTextMaxHeight({
    maxDockHeight: availableHeight / 2,
    bottomInset: bottom,
    reservedContentHeight: reservedContentHeight + footerHeight,
    // Keep the resting row usable with both app text-size steps and system scaling.
    minTextHeight: Math.ceil(minTextHeight * Math.max(1, fontSize / 16) * Math.max(1, fontScale)),
  });
}
