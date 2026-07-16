import { ModalBottomSheet } from '@swmansion/react-native-bottom-sheet';
import { GlassView } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isLiquidGlassAvailable, sheetScrimColor } from '@/config/constants';

export const selectionSheetSnapPointFraction = 0.85;

export type SelectionBottomSheetRenderContext = {
  sheetHeight: number;
};

type SelectionBottomSheetProps = {
  children: ReactNode | ((context: SelectionBottomSheetRenderContext) => ReactNode);
  index: number;
  onIndexChange: (index: number) => void;
  onSettle: (index: number) => void;
};

export function SelectionBottomSheet({
  children,
  index,
  onIndexChange,
  onSettle,
}: SelectionBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const sheetHeight = (windowHeight - insets.top - insets.bottom) * selectionSheetSnapPointFraction;
  const content = typeof children === 'function' ? children({ sheetHeight }) : children;

  return (
    <ModalBottomSheet
      detents={[0, sheetHeight]}
      index={index}
      nativeOverlay
      onIndexChange={onIndexChange}
      onSettle={onSettle}
      // Dim the background behind the sheet so it reads as a layer above the
      // screen. `scrimOpacities` defaults to 0 (closed) → 1 (open), so only the
      // color is needed here.
      scrimColor={sheetScrimColor}
      surface={
        // Pin the surface to the full window width too — see the content note
        // below. `StyleSheet.absoluteFill` alone glued the glass to the same
        // narrow, left-anchored host, leaving a ~16pt uncovered strip on the
        // right ("背景 sheet 短一截"). `left: 0` + an explicit window width lets
        // it overflow the host and cover the full screen.
        isLiquidGlassAvailable ? (
          <GlassView
            glassEffectStyle="regular"
            style={[styles.surfaceFull, styles.surfaceGlass, { width: windowWidth }]}
          />
        ) : (
          <View
            className="rounded-t-3xl bg-background"
            style={[styles.surfaceFull, { width: windowWidth }]}
          />
        )
      }
    >
      {/* Pin the content to the full window width. On some hosts (observed on a
          real iPhone running iOS 27) the native BottomSheet overlay
          (@swmansion/react-native-bottom-sheet) lays its host out ~16pt narrower
          than the window and left-aligned, so both the content and the surface
          were left-anchored and short on the right. Forcing the true window
          width makes them span edge to edge; when the host is already full-width
          this is a no-op (window width == host width, nothing overflows). */}
      <View style={[styles.sheetViewport, { height: sheetHeight, width: windowWidth }]}>
        {content}
      </View>
    </ModalBottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetViewport: {
    overflow: 'hidden',
  },
  // Full-window surface: absolutely fill the host vertically but pin the left
  // edge and drive the width from `useWindowDimensions` (applied inline), so the
  // surface reaches the right screen edge even when the native host is narrower.
  surfaceFull: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  // Matches `rounded-t-3xl`'s --cs-radius-3xl (22px) — GlassView doesn't take
  // className, so the radius is set directly to keep the same silhouette as
  // the non-glass fallback.
  surfaceGlass: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
});
