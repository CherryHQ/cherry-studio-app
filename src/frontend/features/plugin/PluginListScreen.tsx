import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { ContentState } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';

import { PluginIcon } from './components/PluginIcon';
import { getPluginText } from './pluginCatalog';
import { usePluginCatalog } from './usePluginCatalog';
import { usePluginConnections } from './usePluginConnections';

export function PluginListScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const catalog = usePluginCatalog();
  const connections = usePluginConnections();
  const entries = catalog.data ?? [];
  const ids = [
    ...new Set([
      ...entries.map((item) => item.id),
      ...(connections.data ?? []).map((item) => item.pluginId),
    ]),
  ];

  return (
    <>
      <RouteHeader title={t('plugins.title')} />
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-4 px-5 py-3"
        contentInsetAdjustmentBehavior="automatic"
        testID="plugins-list"
      >
        {catalog.isLoading ? <ContentState.Loading title={t('plugins.loading')} /> : null}
        {catalog.isError || connections.isError ? (
          <ContentState.Error
            title={t('plugins.loadFailed')}
            primaryAction={{
              children: t('common.retry'),
              onPress: () => void Promise.all([catalog.refetch(), connections.refetch()]),
            }}
          />
        ) : null}
        <View>
          {ids.map((id) => {
            const entry = entries.find((item) => item.id === id);
            const name = entry ? getPluginText(entry.name, i18n.language) : id;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={name}
                key={id}
                className="flex-row items-center gap-3 rounded-xl py-4 active:bg-secondary"
                onPress={() =>
                  router.push({ pathname: '/plugins/[pluginId]', params: { pluginId: id } })
                }
                testID={`plugin-${id}`}
              >
                <PluginIcon icon={entry?.icon} />
                <View className="flex-1 gap-1">
                  <Text className="text-base font-medium text-foreground">{name}</Text>
                  <Text className="text-sm text-muted-foreground">
                    {entry ? getPluginText(entry.summary, i18n.language) : t('plugins.unavailable')}
                  </Text>
                  {connections.data?.some((item) => item.pluginId === id) ? (
                    <Text className="text-xs text-success">{t('plugins.connected')}</Text>
                  ) : null}
                </View>
                <ChevronRightIcon className="size-5 text-muted-foreground" />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </>
  );
}
