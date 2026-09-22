import { requireNativeView as requireNativeViewManager } from 'expo';
import { createElement, type ComponentType, type PropsWithChildren } from 'react';
import type { NativeSyntheticEvent, StyleProp, ViewStyle } from 'react-native';

/** One dropped image file, copied into the app's cache by the native side. */
export type DroppedImage = {
  height?: number;
  /** Unique per staged item; the staged path can repeat across drops. */
  id: string;
  mediaType?: string;
  name: string;
  size?: number;
  uri: string;
  width?: number;
};

export type ImageDropEvent = {
  /** Items the native side could not stage; their bytes never reached JS. */
  failedCount: number;
  images: DroppedImage[];
  /** Every image item in the drop, including ones over the per-drop cap. */
  totalDropped: number;
};

export type ImageDropTargetProps = PropsWithChildren<{
  /** When false the view refuses every drop session (no composer to attach to). */
  enabled?: boolean;
  onDragEnter?: () => void;
  onDragLeave?: () => void;
  onDropImages?: (event: ImageDropEvent) => void;
  style?: StyleProp<ViewStyle>;
}>;

/**
 * Props as React Native delivers them to the raw native view: every event
 * body rides a synthetic event envelope, with the payload under `nativeEvent`.
 * Drag enter/leave are dispatched with an empty body.
 */
type NativeImageDropTargetProps = PropsWithChildren<{
  enabled?: boolean;
  onDragEnter?: (event: NativeSyntheticEvent<Record<string, never>>) => void;
  onDragLeave?: (event: NativeSyntheticEvent<Record<string, never>>) => void;
  onDropImages?: (event: NativeSyntheticEvent<ImageDropEvent>) => void;
  style?: StyleProp<ViewStyle>;
}>;

const NativeImageDropTarget: ComponentType<NativeImageDropTargetProps> | null = (() => {
  try {
    return requireNativeViewManager<NativeImageDropTargetProps>('ImageDropTarget');
  } catch {
    return null;
  }
})();

/**
 * Resolved once at import, tolerantly: a client built before this module
 * existed (Expo Go, an older development client, Android) simply loses the
 * drop capability — the export is `null` — instead of crashing at import time.
 *
 * Wraps the raw native view so product callbacks receive the bare payload:
 * the synthetic event envelope is a React Native transport detail and is
 * unwrapped here, at the module boundary.
 */
export const ImageDropTargetView: ComponentType<ImageDropTargetProps> | null = (() => {
  if (NativeImageDropTarget === null) {
    return null;
  }
  const NativeView = NativeImageDropTarget;
  return ({
    children,
    enabled,
    onDragEnter,
    onDragLeave,
    onDropImages,
    style,
  }: ImageDropTargetProps) =>
    createElement(
      NativeView,
      {
        enabled,
        style,
        onDragEnter: onDragEnter ? () => onDragEnter() : undefined,
        onDragLeave: onDragLeave ? () => onDragLeave() : undefined,
        onDropImages: onDropImages
          ? (event: NativeSyntheticEvent<ImageDropEvent>) => onDropImages(event.nativeEvent)
          : undefined,
      },
      children,
    );
})();
