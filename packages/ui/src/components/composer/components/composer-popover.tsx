import { type ReactNode, type RefObject, useEffect, useEffectEvent, useId, useRef } from 'react';
import {
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, {
  type AnimatedRef,
  measure,
  type SharedValue,
  useAnimatedRef,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResolveClassNames } from 'uniwind';

import { focusMenuTarget } from '../../menu/menu-focus';
import { useMenuPanelRadius } from '../../menu/menu-panel';
import { useMenuMotion } from '../../menu/use-menu-motion';
import { Portal } from '../../portal';
import { usePortalBackgroundIsolation } from '../../portal/portal-accessibility';
import { SurfaceFrame } from '../../surface/surface-frame';
import {
  type ComposerPopoverFrame,
  getComposerPopoverLayout,
} from '../utils/composer-popover-layout';

type ComposerPopoverProps = {
  accessibilityLabel: string;
  children: ReactNode;
  content: ReactNode;
  initialFocusRef: RefObject<View | null>;
  onClose: (reason: 'outside' | 'anchor' | 'back') => void;
  onClosed?: () => void;
  open: boolean;
  returnFocusRef?: RefObject<View | null>;
  testID?: string;
};

const backdropRegions = [0, 1, 2, 3] as const;

/**
 * A picker above the entire composer, keeping its editor and keyboard reachable.
 * The anchor owns the footprint; the portalled panel never changes chat layout.
 * Callers provide picker content and keep business state outside this component.
 */
export function ComposerPopover({
  accessibilityLabel,
  children,
  content,
  initialFocusRef,
  onClose,
  onClosed,
  open,
  returnFocusRef,
  testID,
}: ComposerPopoverProps) {
  const anchorRef = useAnimatedRef<View>();
  const frame = useSharedValue<ComposerPopoverFrame>({ left: 0, top: 0, width: 0, height: 0 });
  const { isVisible, progress } = useMenuMotion(open);
  const wasVisible = useRef(false);
  usePortalBackgroundIsolation(isVisible);
  const finishClose = useEffectEvent(() => {
    focusMenuTarget(returnFocusRef?.current ?? null);
    onClosed?.();
  });

  useEffect(() => {
    if (isVisible) {
      wasVisible.current = true;
      return;
    }
    if (!wasVisible.current) return;
    wasVisible.current = false;
    // Release background isolation before returning accessibility or editor focus.
    const frameId = requestAnimationFrame(finishClose);
    return () => cancelAnimationFrame(frameId);
  }, [isVisible]);

  function measureAnchor() {
    if (!isVisible) return;
    anchorRef.current?.measureInWindow((left, top, width, height) =>
      frame.set({ left, top, width, height }),
    );
  }

  return (
    <>
      <Animated.View
        collapsable={false}
        onLayout={measureAnchor}
        onTouchStart={isVisible ? () => onClose('anchor') : undefined}
        ref={anchorRef}
      >
        {children}
      </Animated.View>
      {isVisible ? (
        <ComposerPopoverPanel
          accessibilityLabel={accessibilityLabel}
          anchorRef={anchorRef}
          frame={frame}
          initialFocusRef={initialFocusRef}
          onClose={onClose}
          open={open}
          progress={progress}
          testID={testID}
        >
          {content}
        </ComposerPopoverPanel>
      ) : null}
    </>
  );
}

function ComposerPopoverPanel({
  accessibilityLabel,
  anchorRef,
  children,
  frame,
  initialFocusRef,
  onClose,
  open,
  progress,
  testID,
}: Omit<ComposerPopoverProps, 'content'> & {
  anchorRef: AnimatedRef<View>;
  frame: SharedValue<ComposerPopoverFrame>;
  progress: SharedValue<number>;
}) {
  const name = useId();
  const hasFocused = useRef(false);
  const focusFrame = useRef<number | undefined>(undefined);
  const { fontScale, height: windowHeight, width: windowWidth } = useWindowDimensions();
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const insets = useSafeAreaInsets();
  const closeFromBack = useEffectEvent(() => onClose('back'));
  const cornerRadius = useMenuPanelRadius();
  const surfaceFill = useResolveClassNames('bg-popover');
  const layout = useDerivedValue(() =>
    getComposerPopoverLayout({
      anchor: frame.get(),
      fontScale,
      insets,
      keyboardHeight: Math.max(0, -keyboardHeight.get()),
      windowHeight,
      windowWidth,
    }),
  );

  // Seed the placement before UI-thread tracking, and retain ordinary layout
  // measurement on web where Reanimated's native measure is unavailable.
  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      anchorRef.current?.measureInWindow((left, top, width, height) =>
        frame.set({ left, top, width, height }),
      );
    });
    return () => cancelAnimationFrame(frameId);
  }, [anchorRef, frame, windowHeight, windowWidth]);

  // The dock moves on the UI thread with the keyboard, while its height can
  // change independently as the editor grows or folds. Measure only while the
  // popover is mounted so both motions remain attached without JS render churn.
  useFrameCallback(() => {
    const anchor = measure(anchorRef);
    if (!anchor) return;
    const current = frame.get();
    if (
      current.left !== anchor.pageX ||
      current.top !== anchor.pageY ||
      current.width !== anchor.width ||
      current.height !== anchor.height
    ) {
      frame.set({
        left: anchor.pageX,
        top: anchor.pageY,
        width: anchor.width,
        height: anchor.height,
      });
    }
  }, Platform.OS !== 'web');

  useEffect(() => {
    hasFocused.current = false;
    if (!open) return;
    if (Platform.OS === 'web') {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        closeFromBack();
      };
      window.addEventListener('keydown', handleKeyDown, true);
      return () => {
        if (focusFrame.current !== undefined) cancelAnimationFrame(focusFrame.current);
        window.removeEventListener('keydown', handleKeyDown, true);
      };
    }
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      closeFromBack();
      return true;
    });
    return () => {
      if (focusFrame.current !== undefined) cancelAnimationFrame(focusFrame.current);
      back.remove();
    };
  }, [open]);

  const placementStyle = useAnimatedStyle(() => layout.get().panel);
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: 8 * (1 - progress.get()) }],
  }));
  // Keep opacity below the material boundary: alpha on a GlassView ancestor
  // can permanently strip the native glass fill.
  const contentStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, progress.get())),
  }));

  return (
    <Portal name={`composer-popover-${name}`}>
      <View
        accessibilityViewIsModal={open}
        pointerEvents={open ? 'box-none' : 'none'}
        style={StyleSheet.absoluteFill}
      >
        {backdropRegions.map((region) => (
          <PopoverBackdrop
            key={region}
            layout={layout}
            onPress={() => onClose('outside')}
            region={region}
            testID={testID ? `${testID}-backdrop-${region}` : undefined}
          />
        ))}
        <Animated.View
          className="absolute justify-end"
          pointerEvents="box-none"
          style={placementStyle}
        >
          <Animated.View
            accessibilityElementsHidden={!open}
            accessibilityLabel={accessibilityLabel}
            className="max-h-full"
            importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
            onAccessibilityEscape={() => onClose('back')}
            onLayout={({ nativeEvent: { layout: bounds } }) => {
              if (!open || hasFocused.current || bounds.width <= 0 || bounds.height <= 0) return;
              hasFocused.current = true;
              focusFrame.current = requestAnimationFrame(() =>
                focusMenuTarget(initialFocusRef.current),
              );
            }}
            style={panelStyle}
            testID={testID}
          >
            <SurfaceFrame
              className="bg-popover"
              cornerRadius={cornerRadius}
              style={surfaceStyle}
              tintColor={
                typeof surfaceFill.backgroundColor === 'string'
                  ? surfaceFill.backgroundColor
                  : undefined
              }
            >
              <Animated.View className="max-h-full shrink" style={contentStyle}>
                {children}
              </Animated.View>
            </SurfaceFrame>
          </Animated.View>
        </Animated.View>
      </View>
    </Portal>
  );
}

function PopoverBackdrop({
  layout,
  onPress,
  region,
  testID,
}: {
  layout: SharedValue<ReturnType<typeof getComposerPopoverLayout>>;
  onPress: () => void;
  region: number;
  testID?: string;
}) {
  const style = useAnimatedStyle(() => layout.get().outside[region]);
  return (
    <Animated.View className="absolute" style={style}>
      <Pressable
        accessibilityElementsHidden
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        onPress={onPress}
        style={StyleSheet.absoluteFill}
        testID={testID}
      />
    </Animated.View>
  );
}

const surfaceStyle = { maxHeight: '100%', flexShrink: 1 } as const;
