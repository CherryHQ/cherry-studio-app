import { type PropsWithChildren, type RefObject, useCallback } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  composerHorizontalScreenInset,
  getComposerBottomPadding,
  getComposerKeyboardStickyOffset,
} from '../utils/composer-dock-layout';

export type ComposerDockProps = PropsWithChildren<{
  containerRef?: RefObject<View | null>;
  /** Uses normal parent layout instead of overlaying sibling content. */
  layoutMode?: 'floating' | 'flow';
  /** Stops following keyboard coordinates while another surface owns input. */
  keyboardTrackingEnabled?: boolean;
  onHeightChange?: (height: number) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
}>;

export function ComposerDock({
  children,
  containerRef,
  layoutMode = 'floating',
  keyboardTrackingEnabled = true,
  onHeightChange,
  onLayout,
}: ComposerDockProps) {
  const { bottom } = useSafeAreaInsets();

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onHeightChange?.(event.nativeEvent.layout.height);
      onLayout?.(event);
    },
    [onHeightChange, onLayout],
  );

  return (
    <View
      ref={containerRef}
      className={layoutMode === 'flow' ? 'z-10 shrink-0' : 'absolute right-0 bottom-0 left-0 z-10'}
      onLayout={onHeightChange || onLayout ? handleLayout : undefined}
      pointerEvents="box-none"
      style={{
        paddingBottom: getComposerBottomPadding(bottom),
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
