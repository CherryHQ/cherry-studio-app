import { requireNativeView } from 'expo';
import { createElement, type ComponentType } from 'react';
import type { NativeSyntheticEvent, StyleProp, ViewStyle } from 'react-native';

/** Where the display divides the window, in window points, including the system's margins. */
export type FoldRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  /** True while the device is partly folded; a flat device reports its fold line inactive. */
  isActive: boolean;
};

export type FoldRegionObserverProps = {
  onFoldChange: (fold: FoldRegion | null) => void;
  style?: StyleProp<ViewStyle>;
};

type NativeFoldRegionObserverProps = {
  onFoldChange: (event: NativeSyntheticEvent<{ fold: FoldRegion | null }>) => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * Null where the native view is missing (Android, Expo Go, clients built before this module):
 * those windows have no fold to report. The wrapper hands callers the bare region.
 */
export const FoldRegionObserver: ComponentType<FoldRegionObserverProps> | null = (() => {
  let NativeView: ComponentType<NativeFoldRegionObserverProps>;
  try {
    NativeView = requireNativeView<NativeFoldRegionObserverProps>('FoldRegion');
  } catch {
    return null;
  }
  return function FoldRegionObserver({ onFoldChange, style }: FoldRegionObserverProps) {
    return createElement(NativeView, {
      onFoldChange: (event: NativeSyntheticEvent<{ fold: FoldRegion | null }>) =>
        onFoldChange(event.nativeEvent.fold ?? null),
      style,
    });
  };
})();
