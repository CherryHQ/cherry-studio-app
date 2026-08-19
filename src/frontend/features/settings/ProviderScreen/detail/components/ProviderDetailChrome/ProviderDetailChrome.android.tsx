import { ListChecksIcon, RefreshCcwIcon } from '@cherrystudio/app-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ProviderDetailChromeProps } from './ProviderDetailChrome.types';
import { PullSpinner } from './PullSpinner';

export function ProviderDetailChrome({
  editAction,
  pullAction,
  selection,
}: ProviderDetailChromeProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
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

  // Nothing to put in the bar: the configuration tab's own actions are the
  // switch in the banner and the delete button on the settings screen.
  if (!pullAction && !editAction) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12) }]}
    >
      <View className="bg-background/85" pointerEvents="none" style={styles.backdrop} />
      <View className="flex-row items-center">
        <View className="flex-row overflow-hidden rounded-full border border-border bg-field android:shadow-lg">
          {pullAction ? (
            <Pressable
              accessibilityLabel={t('settings.provider.models.pull')}
              accessibilityRole="button"
              accessibilityState={{
                busy: pullAction.isLoading,
                disabled: pullAction.isDisabled || pullAction.isLoading,
              }}
              className="size-12 items-center justify-center active:opacity-60 disabled:opacity-35"
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
              // The divider belongs to whatever follows the first button, and
              // which button is first now depends on the tab.
              className={`size-12 items-center justify-center active:opacity-60 disabled:opacity-35 ${pullAction ? 'border-border border-l' : ''}`}
              disabled={editAction.isDisabled}
              onPress={editAction.onPress}
            >
              <ListChecksIcon className="size-5 text-foreground" />
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
