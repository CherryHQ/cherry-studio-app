import {
  type PropsWithChildren,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { type LayoutChangeEvent, Pressable, View, type ViewInstance } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

import {
  composerHorizontalScreenInset,
  getComposerBottomPadding,
  getComposerKeyboardStickyOffset,
} from '../utils/composer-dock-layout';
import { useComposerExpansion } from './composer-expansion';

const StyledKeyboardStickyView = withUniwind(KeyboardStickyView);

export type ComposerDockProps = PropsWithChildren<{
  containerRef?: RefObject<ViewInstance | null>;
  /** Expandable overlays publish contentInset instead of reserving parent flow space. */
  layoutMode?: 'floating' | 'flow' | 'expandable' | 'expandable-overlay';
  collapseLabel?: string;
  /** Stops following keyboard coordinates while another surface owns input. */
  keyboardTrackingEnabled?: boolean;
  onHeightChange?: (height: number) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
}>;

export function ComposerDock({
  children,
  containerRef,
  layoutMode = 'floating',
  collapseLabel = 'Collapse editor',
  keyboardTrackingEnabled = true,
  onHeightChange,
  onLayout,
}: ComposerDockProps) {
  const { bottom } = useSafeAreaInsets();
  const bottomPadding = getComposerBottomPadding(bottom);
  const expansion = useComposerExpansion();
  const fallbackRef = useRef<ViewInstance>(null);
  const dockRef = containerRef ?? fallbackRef;
  const [compactHeight, setCompactHeight] = useState(0);
  const reservesSpace = layoutMode === 'expandable';
  const isExpandable = (reservesSpace || layoutMode === 'expandable-overlay') && expansion !== null;
  const isPresented = isExpandable && expansion.state.isPresented;
  const tracking = expansion?.meta.keyboardTrackingEnabled;
  const progress = expansion?.meta.progress;
  const compactDockHeight = expansion?.meta.compactDockHeight;
  const contentInset = expansion?.meta.contentInset;

  const recordCompactHeight = useCallback(
    (height: number) => {
      const measuredHeight = Math.ceil(height);
      if (reservesSpace) {
        setCompactHeight((current) => (current === measuredHeight ? current : measuredHeight));
      }
      compactDockHeight?.set(measuredHeight);
      contentInset?.set(measuredHeight);
    },
    [compactDockHeight, contentInset, reservesSpace],
  );

  useEffect(() => {
    if (!isExpandable) return;
    return () => {
      compactDockHeight?.set(0);
      contentInset?.set(0);
    };
  }, [compactDockHeight, contentInset, isExpandable]);

  useEffect(() => {
    if (!isExpandable || isPresented) return;
    let active = true;
    // Closing may end without another layout event. Re-measure once so new
    // text or attachments leave the transcript exactly the compact space.
    dockRef.current?.measure((_x, _y, _width, height) => {
      if (active) recordCompactHeight(height);
    });
    return () => {
      active = false;
    };
  }, [dockRef, isExpandable, isPresented, recordCompactHeight]);

  useLayoutEffect(() => {
    if (isExpandable) tracking?.set(keyboardTrackingEnabled);
  }, [isExpandable, keyboardTrackingEnabled, tracking]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: isExpandable ? (progress?.get() ?? 0) : 0,
  }));
  const dockStyle = useAnimatedStyle(() => ({
    paddingBottom: bottomPadding,
    paddingHorizontal:
      composerHorizontalScreenInset * (1 - (isExpandable ? (progress?.get() ?? 0) : 0)),
  }));

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (isExpandable && !isPresented) {
        recordCompactHeight(event.nativeEvent.layout.height);
      }
      onHeightChange?.(event.nativeEvent.layout.height);
      onLayout?.(event);
    },
    [isExpandable, isPresented, onHeightChange, onLayout, recordCompactHeight],
  );

  // Move the dock boundary with its content: Android BlurTargetView clips
  // children to their own bounds, so a stationary wrapper hides the lifted input.
  const dock = (
    <StyledKeyboardStickyView
      ref={dockRef}
      accessibilityViewIsModal={isPresented}
      className={layoutMode === 'flow' ? 'z-10 shrink-0' : 'absolute right-0 bottom-0 left-0 z-10'}
      enabled={keyboardTrackingEnabled}
      offset={{ opened: getComposerKeyboardStickyOffset(bottom) }}
      onAccessibilityEscape={isPresented ? expansion?.actions.collapse : undefined}
      onLayout={
        (isExpandable && !isPresented) || onHeightChange || onLayout ? handleLayout : undefined
      }
      pointerEvents="box-none"
      style={
        isExpandable
          ? undefined
          : {
              paddingBottom: bottomPadding,
              paddingHorizontal: composerHorizontalScreenInset,
            }
      }
    >
      {isExpandable ? (
        <Animated.View pointerEvents="box-none" style={dockStyle}>
          <Animated.View
            className="absolute inset-0 rounded-t-4xl bg-popover"
            pointerEvents="none"
            style={backdropStyle}
          />
          {children}
        </Animated.View>
      ) : (
        children
      )}
    </StyledKeyboardStickyView>
  );

  if (!isExpandable) return dock;

  return (
    <>
      {reservesSpace ? <View style={{ height: compactHeight }} /> : null}
      <Animated.View
        className="absolute inset-0 bg-scrim"
        pointerEvents={isPresented ? 'auto' : 'none'}
        style={backdropStyle}
      >
        <Pressable
          accessibilityLabel={collapseLabel}
          accessibilityRole="button"
          accessible={isPresented}
          className="flex-1"
          onPress={expansion.actions.collapse}
        />
      </Animated.View>
      {dock}
    </>
  );
}
