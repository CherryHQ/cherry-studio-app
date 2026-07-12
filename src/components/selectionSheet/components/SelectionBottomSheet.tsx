import { ModalBottomSheet } from '@swmansion/react-native-bottom-sheet';
import { GlassView } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isLiquidGlassAvailable } from '@/config/constants';

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
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = (windowHeight - insets.top - insets.bottom) * selectionSheetSnapPointFraction;
  const content = typeof children === 'function' ? children({ sheetHeight }) : children;

  return (
    <ModalBottomSheet
      detents={[0, sheetHeight]}
      index={index}
      nativeOverlay
      onIndexChange={onIndexChange}
      onSettle={onSettle}
      surface={
        isLiquidGlassAvailable ? (
          <GlassView
            glassEffectStyle="regular"
            style={[StyleSheet.absoluteFill, styles.surfaceGlass]}
          />
        ) : (
          <View className="rounded-t-3xl bg-background" style={StyleSheet.absoluteFill} />
        )
      }
    >
      <View style={[styles.sheetViewport, { height: sheetHeight }]}>{content}</View>
    </ModalBottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetViewport: {
    overflow: 'hidden',
  },
  // Matches `rounded-t-3xl`'s --cs-radius-3xl (22px) — GlassView doesn't take
  // className, so the radius is set directly to keep the same silhouette as
  // the non-glass fallback.
  surfaceGlass: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
});
