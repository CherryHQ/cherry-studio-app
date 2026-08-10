import { type PropsWithChildren, type RefObject, useCallback } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  composerHorizontalScreenInset,
  composerMinBottomPadding,
  getComposerKeyboardStickyOffset,
} from '../utils/composerLayout';

type ComposerDockProps = PropsWithChildren<{
  containerRef?: RefObject<View | null>;
  /**
   * The dock's measured height, which is what the list above it reserves. See
   * `useComposerDockLayout` for why the two arrive separately.
   */
  onHeightChange: (height: number) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
}>;

/**
 * Floats a composer at the bottom of a screen: pinned over the content, inset
 * from the screen edges, riding the keyboard, and reporting its own height.
 *
 * Chat and painting both dock an input this way, and neither owns the geometry
 * — it comes from `composerLayout`, so the two stay aligned to the pixel by
 * construction rather than by two files agreeing.
 */
export function ComposerDock({
  children,
  containerRef,
  onHeightChange,
  onLayout,
}: ComposerDockProps) {
  const { bottom } = useSafeAreaInsets();

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onHeightChange(event.nativeEvent.layout.height);
      onLayout?.(event);
    },
    [onHeightChange, onLayout],
  );

  return (
    <View
      ref={containerRef}
      className="absolute right-0 bottom-0 left-0 z-10"
      onLayout={handleLayout}
      pointerEvents="box-none"
      style={{
        paddingBottom: Math.max(bottom, composerMinBottomPadding),
        paddingHorizontal: composerHorizontalScreenInset,
      }}
    >
      <KeyboardStickyView offset={{ opened: getComposerKeyboardStickyOffset(bottom) }}>
        {children}
      </KeyboardStickyView>
    </View>
  );
}
