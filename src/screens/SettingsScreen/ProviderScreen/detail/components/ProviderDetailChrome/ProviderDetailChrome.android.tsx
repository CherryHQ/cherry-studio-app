import { ActivityIcon, PauseIcon, PlayIcon, RefreshCcwIcon, Trash2Icon } from 'lucide-uniwind/png';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ProviderDetailChromeProps } from './ProviderDetailChrome.types';

export function ProviderDetailChrome({
  canDelete,
  checkAction,
  isActive,
  isDisabled,
  onDelete,
  onToggleActive,
  pullAction,
}: ProviderDetailChromeProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const toggleLabel = t(
    isActive ? 'settings.provider.disableProvider' : 'settings.provider.enableProvider',
  );

  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12) }]}
    >
      <View className="bg-background/85" pointerEvents="none" style={styles.backdrop} />
      <View className="flex-row items-center justify-between">
        <View className="flex-row overflow-hidden rounded-full border border-border bg-field android:shadow-lg">
          <Pressable
            accessibilityLabel={toggleLabel}
            accessibilityRole="button"
            accessibilityState={{ disabled: isDisabled, selected: isActive }}
            className="size-12 items-center justify-center active:opacity-60 disabled:opacity-35"
            disabled={isDisabled}
            onPress={onToggleActive}
          >
            {isActive ? (
              <PauseIcon className="size-5 text-foreground" strokeWidth={2} />
            ) : (
              <PlayIcon className="size-5 text-primary" strokeWidth={2} />
            )}
          </Pressable>

          {canDelete ? (
            <Pressable
              accessibilityLabel={t('settings.provider.deleteProvider')}
              accessibilityRole="button"
              accessibilityState={{ disabled: isDisabled }}
              className="size-12 items-center justify-center border-border border-l active:opacity-60 disabled:opacity-35"
              disabled={isDisabled}
              onPress={onDelete}
            >
              <Trash2Icon className="size-5 text-danger" strokeWidth={2} />
            </Pressable>
          ) : null}

          {pullAction ? (
            <Pressable
              accessibilityLabel={t('settings.provider.models.pull')}
              accessibilityRole="button"
              accessibilityState={{
                busy: pullAction.isLoading,
                disabled: pullAction.isDisabled || pullAction.isLoading,
              }}
              className="size-12 items-center justify-center border-border border-l active:opacity-60 disabled:opacity-35"
              disabled={pullAction.isDisabled || pullAction.isLoading}
              onPress={pullAction.onPress}
            >
              <RefreshCcwIcon className="size-5 text-foreground" strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>

        {checkAction ? (
          <View className="overflow-hidden rounded-full border border-border bg-field android:shadow-lg">
            <Pressable
              accessibilityLabel={t('settings.provider.models.check')}
              accessibilityRole="button"
              accessibilityState={{
                busy: checkAction.isLoading,
                disabled: checkAction.isDisabled || checkAction.isLoading,
              }}
              className="size-12 items-center justify-center active:opacity-60 disabled:opacity-35"
              disabled={checkAction.isDisabled || checkAction.isLoading}
              onPress={checkAction.onPress}
            >
              <ActivityIcon className="size-5 text-foreground" strokeWidth={2} />
            </Pressable>
          </View>
        ) : null}
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
