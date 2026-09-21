import { requireNativeView as requireNativeViewManager } from 'expo';
import type { ComponentType, PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

/** One dropped image file, copied into the app's cache by the native side. */
export type DroppedImage = {
  height?: number;
  mediaType?: string;
  name: string;
  size?: number;
  uri: string;
  width?: number;
};

export type ImageDropEvent = {
  images: DroppedImage[];
};

export type ImageDropTargetProps = PropsWithChildren<{
  onDragEnter?: () => void;
  onDragLeave?: () => void;
  onDropImages?: (event: ImageDropEvent) => void;
  style?: StyleProp<ViewStyle>;
}>;

/**
 * Resolved once at import, tolerantly: a client built before this module
 * existed (Expo Go, an older development client, Android) simply loses the
 * drop capability — the export is `null` — instead of crashing at import time.
 */
export const ImageDropTargetView: ComponentType<ImageDropTargetProps> | null = (() => {
  try {
    return requireNativeViewManager<ImageDropTargetProps>('ImageDropTarget');
  } catch {
    return null;
  }
})();
