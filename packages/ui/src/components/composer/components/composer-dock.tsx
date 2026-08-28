import { type PropsWithChildren, type RefObject, useCallback } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  composerHorizontalScreenInset,
  composerMinBottomPadding,
  getComposerKeyboardStickyOffset,
} from '../utils/composer-dock-layout';

export type ComposerDockProps = PropsWithChildren<{
  containerRef?: RefObject<View | null>;
  /** Stops following keyboard coordinates while another surface owns input. */
  keyboardTrackingEnabled?: boolean;
  onHeightChange: (height: number) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
}>;

export function ComposerDock({
  children,
  containerRef,
  keyboardTrackingEnabled = true,
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
      <KeyboardStickyView
        enabled={keyboardTrackingEnabled}
        offset={{ opened: getComposerKeyboardStickyOffset(bottom) }}
      >
        {children}
      </KeyboardStickyView>
    </View>
  );
}
