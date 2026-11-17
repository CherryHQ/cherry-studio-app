import { BlurView } from 'expo-blur';
import type { RefObject } from 'react';
import { StyleSheet, View, type ViewInstance } from 'react-native';
import { useUniwind } from 'uniwind';

type ModelPickerBackdropProps = {
  blurTarget: RefObject<ViewInstance | null>;
  variant: 'rail' | 'preview';
};

/** The picker index and its identity preview blur the same model-list viewport. */
export function ModelPickerBackdrop({ blurTarget, variant }: ModelPickerBackdropProps) {
  const { theme } = useUniwind();

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <BlurView
        blurMethod="dimezisBlurViewSdk31Plus"
        blurTarget={blurTarget}
        intensity={variant === 'rail' ? 30 : 40}
        style={StyleSheet.absoluteFill}
        tint={theme === 'dark' ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'}
      />
      <View
        className={
          variant === 'rail'
            ? 'absolute inset-0 bg-card/35 dark:bg-card/45'
            : 'absolute inset-0 bg-card/60 dark:bg-popover/65'
        }
      />
    </View>
  );
}
