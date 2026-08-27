import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ProviderModelPullChromeProps } from './ProviderModelPullChrome.types';

export function ProviderModelPullChrome({
  isAllSelected,
  isApplying,
  isSelectionScoped,
  isToggleAllDisabled,
  onApply,
  onToggleAll,
  selectedCount,
}: ProviderModelPullChromeProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const selectAllLabel = t(
    isSelectionScoped
      ? isAllSelected
        ? 'settings.provider.models.selection.deselectVisible'
        : 'settings.provider.models.selection.selectVisible'
      : isAllSelected
        ? 'settings.provider.models.selection.deselectAll'
        : 'settings.provider.models.selection.selectAll',
  );
  const applyLabel =
    selectedCount === 0
      ? t('settings.provider.models.pullApply')
      : t('settings.provider.models.pullApplySelected', { count: selectedCount });

  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12) }]}
    >
      <View className="bg-background/85" pointerEvents="none" style={styles.backdrop} />
      <View className="flex-row items-center justify-between">
        <Pressable
          accessibilityLabel={selectAllLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled: isApplying || isToggleAllDisabled }}
          className="items-center justify-center rounded-full border border-border bg-field px-5 py-3 active:opacity-60 disabled:opacity-35 android:shadow-lg"
          disabled={isApplying || isToggleAllDisabled}
          onPress={onToggleAll}
        >
          <Text className="font-medium text-foreground text-sm" numberOfLines={1}>
            {selectAllLabel}
          </Text>
        </Pressable>

        <Pressable
          accessibilityLabel={applyLabel}
          accessibilityRole="button"
          accessibilityState={{ busy: isApplying, disabled: selectedCount === 0 || isApplying }}
          className="items-center justify-center rounded-full bg-foreground px-5 py-3 active:opacity-60 disabled:opacity-35 android:shadow-lg"
          disabled={selectedCount === 0 || isApplying}
          onPress={onApply}
        >
          <Text className="font-medium text-background text-sm" numberOfLines={1}>
            {applyLabel}
          </Text>
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
