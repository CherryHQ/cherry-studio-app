import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { PluginCatalogEntry } from '@/shared/data/types/plugin';

import { PluginIcon } from './PluginIcon';

export function PluginIdentity({ entry }: { entry: PluginCatalogEntry }) {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center gap-4">
      <PluginIcon icon={entry.icon} size="large" />
      <View className="min-w-0 flex-1 gap-1">
        <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">
          {t(`plugins.catalog.${entry.id}.name`)}
        </Text>
        <Text className="text-sm text-muted-foreground">
          {t(`plugins.catalog.${entry.id}.summary`)}
        </Text>
      </View>
    </View>
  );
}
