import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { selectionToolbarGap } from '../selectionToolbarLayout';
import type { SelectionToolbarProps } from './types';

export function SelectionToolbar({
  isDeleting,
  onDelete,
  onToggleAll,
  selectedCount,
}: SelectionToolbarProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isDeleteDisabled = selectedCount === 0 || isDeleting;
  const selectionLabel =
    selectedCount === 0
      ? t('common.selection.selectAll')
      : t('common.selection.count', { count: selectedCount });

  return (
    <Animated.View
      entering={FadeInDown.duration(180)}
      exiting={FadeOutDown.duration(140)}
      pointerEvents="box-none"
      style={[
        styles.container,
        { paddingBottom: Math.max(insets.bottom - 2, selectionToolbarGap) },
      ]}
    >
      <View className="bg-background/85" pointerEvents="none" style={styles.backdrop} />
      <View className="flex-row justify-between" style={styles.controls} testID="selection-toolbar">
        <Pressable
          accessibilityLabel={selectionLabel}
          accessibilityRole="button"
          className="items-center justify-center rounded-full border border-border bg-field px-5 py-3 active:opacity-60 android:shadow-lg"
          disabled={isDeleting}
          onPress={onToggleAll}
        >
          <Text className="font-medium text-foreground text-sm" numberOfLines={1}>
            {selectionLabel}
          </Text>
        </Pressable>

        <Pressable
          accessibilityLabel={t('common.delete')}
          accessibilityRole="button"
          className="items-center justify-center rounded-full border border-border bg-field px-5 py-3 active:opacity-60 disabled:opacity-35 android:shadow-lg"
          disabled={isDeleteDisabled}
          onPress={onDelete}
        >
          <Text className="font-medium text-destructive text-sm" numberOfLines={1}>
            {t('common.delete')}
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: selectionToolbarGap,
  },
  container: {
    bottom: 0,
    left: 0,
    paddingHorizontal: 12,
    paddingTop: selectionToolbarGap,
    position: 'absolute',
    right: 0,
    zIndex: 20,
  },
  controls: {
    alignItems: 'center',
  },
});
