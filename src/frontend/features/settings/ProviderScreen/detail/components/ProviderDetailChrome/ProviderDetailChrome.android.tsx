import {
  ListChecksIcon,
  PauseIcon,
  PlayIcon,
  RefreshCcwIcon,
  Trash2Icon,
} from '@cherrystudio/app-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ProviderDetailChromeProps } from './ProviderDetailChrome.types';
import { PullSpinner } from './PullSpinner';

export function ProviderDetailChrome({
  canDelete,
  editAction,
  isActive,
  isDisabled,
  onDelete,
  onToggleActive,
  pullAction,
  selection,
}: ProviderDetailChromeProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const toggleLabel = t(
    isActive ? 'settings.provider.disableProvider' : 'settings.provider.enableProvider',
  );
  const selectAllLabel = t(
    selection?.isAllSelected
      ? 'settings.provider.models.selection.deselectAll'
      : 'settings.provider.models.selection.selectAll',
  );

  if (selection) {
    return (
      <View
        pointerEvents="box-none"
        style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12) }]}
      >
        <View className="bg-background/85" pointerEvents="none" style={styles.backdrop} />
        <View className="flex-row items-center">
          <Pressable
            accessibilityLabel={selectAllLabel}
            accessibilityRole="button"
            className="items-center justify-center rounded-full border border-border bg-field px-5 py-3 active:opacity-60 android:shadow-lg"
            onPress={selection.onToggleAll}
          >
            <Text className="font-medium text-foreground text-sm" numberOfLines={1}>
              {selectAllLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12) }]}
    >
      <View className="bg-background/85" pointerEvents="none" style={styles.backdrop} />
      <View className="flex-row items-center">
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
              <PauseIcon className="size-5 text-foreground" />
            ) : (
              <PlayIcon className="size-5 text-primary" />
            )}
          </Pressable>

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
              {pullAction.isLoading ? (
                <PullSpinner className="size-5 text-foreground" />
              ) : (
                <RefreshCcwIcon className="size-5 text-foreground" />
              )}
            </Pressable>
          ) : null}

          {editAction ? (
            <Pressable
              accessibilityLabel={t('settings.provider.models.selection.start')}
              accessibilityRole="button"
              accessibilityState={{ disabled: editAction.isDisabled }}
              className="size-12 items-center justify-center border-border border-l active:opacity-60 disabled:opacity-35"
              disabled={editAction.isDisabled}
              onPress={editAction.onPress}
            >
              <ListChecksIcon className="size-5 text-foreground" />
            </Pressable>
          ) : null}

          {canDelete ? (
            <Pressable
              accessibilityLabel={t('settings.provider.deleteProvider')}
              accessibilityRole="button"
              accessibilityState={{ disabled: isDisabled }}
              className="size-12 items-center justify-center border-border border-l active:opacity-60 disabled:opacity-35"
              disabled={isDisabled}
              onPress={onDelete}
            >
              <Trash2Icon className="size-5 text-destructive" />
            </Pressable>
          ) : null}
        </View>
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
