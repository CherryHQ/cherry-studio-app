import { requireNativeView, requireOptionalNativeModule } from 'expo';
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

/** Geometry from one native observation; host and fold share the window coordinate space. */
export type FoldRegionLayout = {
  host: { x: number; y: number; width: number; height: number };
  insets: { left: number; right: number };
  window: { width: number; height: number };
  fold: FoldRegion | null;
};

export type FoldRegionObserverProps = {
  onLayoutChange: (layout: FoldRegionLayout) => void;
  style?: StyleProp<ViewStyle>;
};

type NativeFoldRegionObserverProps = {
  onLayoutChange: (event: NativeSyntheticEvent<FoldRegionLayout>) => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * Null where the native module is missing (Android, Expo Go, clients built before this module):
 * those windows have no fold to report. `requireNativeView` would still return a component there,
 * so the module's presence decides. The wrapper hands callers the complete layout snapshot.
 */
export const FoldRegionObserver: ComponentType<FoldRegionObserverProps> | null = (() => {
  if (!requireOptionalNativeModule('FoldRegion')) return null;
  const NativeView = requireNativeView<NativeFoldRegionObserverProps>('FoldRegion');
  return function FoldRegionObserver({ onLayoutChange, style }: FoldRegionObserverProps) {
    return createElement(NativeView, {
      onLayoutChange: (event: NativeSyntheticEvent<FoldRegionLayout>) =>
        onLayoutChange(event.nativeEvent),
      style,
    });
  };
})();
