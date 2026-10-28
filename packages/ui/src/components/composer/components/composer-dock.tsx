import {
  type PropsWithChildren,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { type LayoutChangeEvent, Pressable, View, type ViewInstance } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  composerHorizontalScreenInset,
  getComposerBottomPadding,
  getComposerKeyboardStickyOffset,
} from '../utils/composer-dock-layout';
import { useComposerExpansion } from './composer-expansion';

export type ComposerDockProps = PropsWithChildren<{
  /** Paints the compact dock's whole footprint so an overlaid transcript stays out of sight. */
  backgroundClassName?: string;
  containerRef?: RefObject<ViewInstance | null>;
  /** Expandable overlays publish contentInset instead of reserving parent flow space. */
  layoutMode?: 'floating' | 'flow' | 'expandable' | 'expandable-overlay';
  collapseLabel?: string;
  /**
   * Follows keyboard coordinates only while true, so another surface can own input. Read on the
   * UI thread: focus lifts the dock on the keyboard's first frame, not after a React commit.
   */
  keyboardTracking?: SharedValue<boolean>;
  onHeightChange?: (height: number) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
}>;

export function ComposerDock({
  backgroundClassName,
  children,
  containerRef,
  layoutMode = 'floating',
  collapseLabel = 'Collapse editor',
  keyboardTracking,
  onHeightChange,
  onLayout,
}: ComposerDockProps) {
  const { bottom } = useSafeAreaInsets();
  const { height: keyboardHeight, progress: keyboardProgress } = useReanimatedKeyboardAnimation();
  const keyboardOffset = getComposerKeyboardStickyOffset(bottom);
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
  const recordDockHeight = expansion?.actions.recordDockHeight;
  const releaseDock = expansion?.actions.releaseDock;

  const recordCompactHeight = useCallback(
    (height: number) => {
      const measuredHeight = Math.ceil(height);
      if (reservesSpace) {
        setCompactHeight((current) => (current === measuredHeight ? current : measuredHeight));
      }
      recordDockHeight?.(measuredHeight);
    },
    [recordDockHeight, reservesSpace],
  );

  useEffect(() => {
    if (!isExpandable) return;
    return () => releaseDock?.();
  }, [isExpandable, releaseDock]);

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

  useAnimatedReaction(
    () => keyboardTracking?.get() ?? true,
    (enabled) => {
      if (isExpandable) tracking?.set(enabled);
    },
    [isExpandable, keyboardTracking, tracking],
  );

  const stickyStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY:
          (keyboardTracking?.get() ?? true)
            ? keyboardHeight.get() + keyboardProgress.get() * keyboardOffset
            : 0,
      },
    ],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: isExpandable ? (progress?.get() ?? 0) : 0,
  }));
  const restingBackgroundStyle = useAnimatedStyle(() => ({
    opacity: 1 - (progress?.get() ?? 0),
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
    <Animated.View
      ref={dockRef}
      accessibilityViewIsModal={isPresented}
      className={layoutMode === 'flow' ? 'z-10 shrink-0' : 'absolute right-0 bottom-0 left-0 z-10'}
      onAccessibilityEscape={isPresented ? expansion?.actions.collapse : undefined}
      onLayout={
        (isExpandable && !isPresented) || onHeightChange || onLayout ? handleLayout : undefined
      }
      pointerEvents="box-none"
      style={
        isExpandable
          ? stickyStyle
          : [
              { paddingBottom: bottomPadding, paddingHorizontal: composerHorizontalScreenInset },
              stickyStyle,
            ]
      }
    >
      {isExpandable ? (
        <Animated.View pointerEvents="box-none" style={dockStyle}>
          {backgroundClassName ? (
            <Animated.View
              className={`absolute inset-0 ${backgroundClassName}`}
              pointerEvents="none"
              style={restingBackgroundStyle}
            />
          ) : null}
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
    </Animated.View>
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
