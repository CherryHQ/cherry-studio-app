import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { Button, ContentState } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { InlineSearch, useInlineSearch } from '@/frontend/components/InlineSearch';

import { PluginIcon } from './components/PluginIcon';
import { PLUGIN_IDS } from './pluginCatalog';
import { usePluginConnections } from './usePluginConnections';

export function PluginListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const connections = usePluginConnections();
  const [filter, setFilter] = useState<'all' | 'connected'>('all');
  const { query, setQuery, results } = useInlineSearch({
    items: PLUGIN_IDS,
    fields: (id) => [t(`plugins.catalog.${id}.name`), t(`plugins.catalog.${id}.summary`)],
  });
  const visible = results.filter(
    (id) => filter === 'all' || connections.data?.some((item) => item.pluginId === id),
  );

  return (
    <>
      <RouteHeader title={t('plugins.title')} />
      <InlineSearch value={query} onChangeText={setQuery} />
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-7 px-5 py-5"
        contentInsetAdjustmentBehavior="automatic"
        testID="plugins-list"
      >
        <View className="gap-2">
          <Text className="text-3xl font-semibold text-foreground">{t('plugins.discover')}</Text>
          <Text className="text-base text-muted-foreground">{t('plugins.subtitle')}</Text>
        </View>
        <View className="flex-row gap-2">
          <Button
            size="sm"
            shape="pill"
            variant={filter === 'all' ? 'default' : 'ghost'}
            onPress={() => setFilter('all')}
          >
            {t('plugins.all')}
          </Button>
          <Button
            size="sm"
            shape="pill"
            variant={filter === 'connected' ? 'default' : 'ghost'}
            onPress={() => setFilter('connected')}
          >
            {t('plugins.connected')}
          </Button>
        </View>
        {connections.isError ? (
          <ContentState.Error
            title={t('plugins.loadFailed')}
            primaryAction={{
              children: t('common.retry'),
              onPress: () => void connections.refetch(),
            }}
          />
        ) : null}
        {filter === 'connected' && connections.isLoading ? (
          <ContentState.Loading title={t('plugins.loading')} />
        ) : visible.length === 0 ? (
          <ContentState.Empty
            title={t(filter === 'connected' ? 'plugins.noConnections' : 'plugins.noResults')}
          />
        ) : (
          <View className="gap-2">
            {visible.map((id) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(`plugins.catalog.${id}.name`)}
                key={id}
                className="flex-row items-center gap-4 rounded-2xl py-4 active:bg-secondary"
                onPress={() =>
                  router.push({ pathname: '/plugins/[pluginId]', params: { pluginId: id } })
                }
                testID={`plugin-${id}`}
              >
                <PluginIcon pluginId={id} />
                <View className="flex-1 gap-1">
                  <Text className="text-lg font-semibold text-foreground">
                    {t(`plugins.catalog.${id}.name`)}
                  </Text>
                  <Text className="text-sm text-muted-foreground">
                    {t(`plugins.catalog.${id}.summary`)}
                  </Text>
                  {connections.data?.some((item) => item.pluginId === id) ? (
                    <Text className="text-xs text-success">{t('plugins.connected')}</Text>
                  ) : null}
                </View>
                <ChevronRightIcon className="size-5 text-muted-foreground" />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}
