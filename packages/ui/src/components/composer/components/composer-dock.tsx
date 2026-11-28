import { LinearGradient } from 'expo-linear-gradient';
import {
  type PropsWithChildren,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type LayoutChangeEvent, Pressable, View, type ViewInstance } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResolveClassNames } from 'uniwind';

import {
  composerHorizontalScreenInset,
  getComposerBottomPadding,
  getComposerKeyboardStickyOffset,
} from '../utils/composer-dock-layout';
import { useComposerExpansion } from './composer-expansion';

const COMPOSER_DOCK_FADE_HEIGHT = 20;
const COMPOSER_DOCK_FADE_OVERLAP = 1;
const FADE_START = { x: 0.5, y: 0 } as const;
const FADE_END = { x: 0.5, y: 1 } as const;
const FADE_LOCATIONS = [
  0,
  COMPOSER_DOCK_FADE_HEIGHT / (COMPOSER_DOCK_FADE_HEIGHT + COMPOSER_DOCK_FADE_OVERLAP),
  1,
] as const;
const FLOOR_CONTAINER_STYLE = {
  bottom: 0,
  left: 0,
  position: 'absolute',
  right: 0,
} as const;
const FADE_BAND_STYLE = {
  height: COMPOSER_DOCK_FADE_HEIGHT + COMPOSER_DOCK_FADE_OVERLAP,
  marginBottom: -COMPOSER_DOCK_FADE_OVERLAP,
} as const;

// Static literal pairs so Uniwind / Tailwind v4 always compiles both the solid and 0-alpha utilities.
const DOCK_FADE_SURFACES = {
  'bg-background': 'bg-background/0',
  'bg-chat-background': 'bg-chat-background/0',
} as const;

export type ComposerDockBackgroundClassName = keyof typeof DOCK_FADE_SURFACES;

export type ComposerDockProps = PropsWithChildren<{
  /** Paints a solid floor below the compact composer with a short soft fade into its bottom edge. */
  backgroundClassName?: ComposerDockBackgroundClassName;
  containerRef?: RefObject<ViewInstance | null>;
  /** Expandable overlays publish contentInset instead of reserving parent flow space. */
  layoutMode?: 'floating' | 'flow' | 'expandable' | 'expandable-overlay';
  collapseLabel?: string;
  /** Extra resting bottom clearance (e.g. a floating bottom navigation bar), eased to 0 on keyboard/expansion. */
  extraBottomOffset?: number;
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
  extraBottomOffset = 0,
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
  const restingExtraOffset = Math.max(0, extraBottomOffset);
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
  const dockLift = expansion?.meta.dockLift;
  const editorMorphing = expansion?.meta.editorMorphing;

  const recordCompactHeight = useCallback(
    (height: number) => {
      const measuredHeight = Math.ceil(height);
      if (reservesSpace) {
        setCompactHeight((current) => (current === measuredHeight ? current : measuredHeight));
      }
      compactDockHeight?.set(measuredHeight);
    },
    [compactDockHeight, reservesSpace],
  );

  useEffect(() => {
    if (!isExpandable) return;
    return () => {
      compactDockHeight?.set(0);
      contentInset?.set(0);
      dockLift?.set(0);
    };
  }, [compactDockHeight, contentInset, dockLift, isExpandable]);

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

  // The list uses the settled compact footprint. Intermediate editor layout events only move
  // visual accessories. Manual expansion separately keeps the compact footprint reserved.
  useAnimatedReaction(
    () =>
      isExpandable && !isPresented && !editorMorphing?.get() ? compactDockHeight?.get() : undefined,
    (height) => {
      if (height !== undefined && height !== contentInset?.get()) contentInset?.set(height);
    },
  );

  const stickyTranslation = useDerivedValue(() => {
    const isTracking = keyboardTracking?.get() ?? true;
    if (!isTracking) return 0;
    const expandProgress = isExpandable ? (progress?.get() ?? 0) : 0;
    const baseTranslation = keyboardHeight.get() + keyboardProgress.get() * keyboardOffset;
    const collapsedExtraOffset =
      Math.min(restingExtraOffset, Math.max(0, -baseTranslation)) * (1 - expandProgress);
    return baseTranslation + collapsedExtraOffset;
  });
  useAnimatedReaction(
    () => (isExpandable ? Math.max(0, -stickyTranslation.get()) : 0),
    (lift) => dockLift?.set(lift),
  );
  const stickyStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: stickyTranslation.get() }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: isExpandable ? (progress?.get() ?? 0) : 0,
  }));
  const restingBackgroundStyle = useAnimatedStyle(() => ({
    opacity: 1 - (progress?.get() ?? 0),
  }));
  const floorHeightStyle = useAnimatedStyle(() => {
    const expandProgress = isExpandable ? (progress?.get() ?? 0) : 0;
    const restingOffset = restingExtraOffset * (1 - expandProgress);
    return {
      height: bottomPadding + restingOffset,
    };
  });
  const dockStyle = useAnimatedStyle(() => {
    const expandProgress = isExpandable ? (progress?.get() ?? 0) : 0;
    const restingOffset = restingExtraOffset * (1 - expandProgress);
    return {
      paddingBottom: bottomPadding + restingOffset,
      paddingHorizontal: composerHorizontalScreenInset * (1 - expandProgress),
    };
  });

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
      style={isExpandable ? stickyStyle : [dockStyle, stickyStyle]}
    >
      {isExpandable ? (
        <Animated.View pointerEvents="box-none" style={dockStyle}>
          {backgroundClassName ? (
            <ComposerDockFade
              backgroundClassName={backgroundClassName}
              floorHeightStyle={floorHeightStyle}
              restingBackgroundStyle={restingBackgroundStyle}
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

function ComposerDockFade({
  backgroundClassName,
  floorHeightStyle,
  restingBackgroundStyle,
}: {
  backgroundClassName: ComposerDockBackgroundClassName;
  floorHeightStyle: ReturnType<typeof useAnimatedStyle>;
  restingBackgroundStyle: ReturnType<typeof useAnimatedStyle>;
}) {
  const resolvedSolid = useResolveClassNames(backgroundClassName);
  const resolvedTransparent = useResolveClassNames(DOCK_FADE_SURFACES[backgroundClassName]);
  const fadeSolidColor =
    typeof resolvedSolid.backgroundColor === 'string' ? resolvedSolid.backgroundColor : undefined;
  const fadeStartColor =
    typeof resolvedTransparent.backgroundColor === 'string'
      ? resolvedTransparent.backgroundColor
      : undefined;
  const fadeColors = useMemo(
    () =>
      fadeStartColor && fadeSolidColor
        ? ([fadeStartColor, fadeSolidColor, fadeSolidColor] as const)
        : null,
    [fadeSolidColor, fadeStartColor],
  );

  return (
    <Animated.View
      pointerEvents="none"
      style={[FLOOR_CONTAINER_STYLE, restingBackgroundStyle]}
      testID="composer-dock-fade"
    >
      {fadeColors ? (
        <LinearGradient
          colors={fadeColors}
          end={FADE_END}
          locations={FADE_LOCATIONS}
          pointerEvents="none"
          start={FADE_START}
          style={FADE_BAND_STYLE}
        />
      ) : null}
      <Animated.View
        className={backgroundClassName}
        pointerEvents="none"
        style={floorHeightStyle}
        testID="composer-dock-floor"
      />
    </Animated.View>
  );
}
