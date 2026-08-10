import { ActivityIcon } from 'lucide-uniwind/png';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { WebSearchProviderChromeProps } from './WebSearchProviderChrome.types';

export function WebSearchProviderChrome({ onCheck }: WebSearchProviderChromeProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="items-end"
      pointerEvents="box-none"
      style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12) }]}
    >
      <View className="bg-background/85" pointerEvents="none" style={styles.backdrop} />
      <View className="overflow-hidden rounded-full border border-border bg-field android:shadow-lg">
        <Pressable
          accessibilityLabel={t('settings.websearch.provider.check')}
          accessibilityRole="button"
          className="size-12 items-center justify-center active:opacity-60"
          onPress={onCheck}
        >
          <ActivityIcon className="size-5 text-foreground" strokeWidth={2} />
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
