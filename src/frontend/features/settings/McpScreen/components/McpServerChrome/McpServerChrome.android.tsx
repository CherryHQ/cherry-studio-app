import PauseIcon from '@cherrystudio/app-icons/icons/pause';
import PlayIcon from '@cherrystudio/app-icons/icons/play';
import Trash2Icon from '@cherrystudio/app-icons/icons/trash-2';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { McpServerChromeProps } from './McpServerChrome.types';

export function McpServerChrome({
  isDisabled,
  isEnabled,
  onDelete,
  onToggleEnabled,
}: McpServerChromeProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const toggleLabel = t(isEnabled ? 'settings.mcp.disableServer' : 'settings.mcp.enableServer');

  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12) }]}
    >
      <View className="bg-background/85" pointerEvents="none" style={styles.backdrop} />
      <View className="flex-row self-start overflow-hidden rounded-full border border-border bg-field android:shadow-lg">
        <Pressable
          accessibilityLabel={toggleLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled: isDisabled, selected: isEnabled }}
          className="size-12 items-center justify-center active:opacity-60 disabled:opacity-35"
          disabled={isDisabled}
          onPress={onToggleEnabled}
        >
          {isEnabled ? (
            <PauseIcon className="size-5 text-foreground" />
          ) : (
            <PlayIcon className="size-5 text-foreground" />
          )}
        </Pressable>

        <Pressable
          accessibilityLabel={t('settings.mcp.deleteServer')}
          accessibilityRole="button"
          accessibilityState={{ disabled: isDisabled }}
          className="size-12 items-center justify-center border-border border-l active:opacity-60 disabled:opacity-35"
          disabled={isDisabled}
          onPress={onDelete}
        >
          <Trash2Icon className="size-5 text-destructive" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 8,
  },
  container: {
    bottom: 0,
    left: 0,
    paddingHorizontal: 12,
    paddingTop: 8,
    position: 'absolute',
    right: 0,
    zIndex: 20,
  },
});
