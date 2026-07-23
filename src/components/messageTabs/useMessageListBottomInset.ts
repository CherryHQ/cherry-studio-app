import { useState } from 'react';
import { useBottomTabBarHeight } from 'react-native-bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { selectionToolbarGap, selectionToolbarHeight } from './selectionToolbarLayout';

// The message-tab lists (topics + drawings) sit above two mutually-exclusive
// bottom bars: the app tab bar at rest, and the selection toolbar in edit mode.
// Entering/leaving edit mode hides the tab bar and shows the toolbar (or vice
// versa). While the tab bar is hidden the native side re-measures its height to
// 0 (it becomes GONE on Android; iOS stops reporting), so if the list's bottom
// inset tracked `tabBarHeight` directly it would collapse on every edit⇄done and
// the content container would resize — a reflow that reads as a flash.
//
// We return ONE inset that clears whichever bar is showing and never changes
// across the toggle, so the list content stays put:
//   - `tabBarHeight` is latched to its last non-zero reading, so the transient 0
//     while the bar is hidden can't shrink the inset;
//   - we take the max of that and the toolbar's footprint so the same value
//     covers both states.
// Both terms are independent of `isEditing`, so callers can drop it from their
// contentContainerStyle memo and keep a stable style reference.
export function useMessageListBottomInset(): number {
  const rawTabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const [tabBarHeight, setTabBarHeight] = useState(rawTabBarHeight);

  // Latch during render (React's "adjusting state when a prop changes" pattern):
  // only track real, non-zero heights, ignoring the transient 0 while hidden.
  if (rawTabBarHeight > 0 && rawTabBarHeight !== tabBarHeight) {
    setTabBarHeight(rawTabBarHeight);
  }

  const selectionToolbarInset = insets.bottom + selectionToolbarHeight + selectionToolbarGap * 2;

  return Math.max(tabBarHeight, selectionToolbarInset);
}
