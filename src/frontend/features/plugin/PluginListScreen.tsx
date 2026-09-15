import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { ContentState } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';

import { PluginIcon } from './components/PluginIcon';
import { PluginPage } from './components/PluginPage';
import { usePluginCatalog } from './usePluginCatalog';
import { usePluginConnections } from './usePluginConnections';

export function PluginListScreen() {
  const { t } = useTranslation();
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
      <PluginPage testID="plugins-list">
        <Text className="text-sm text-muted-foreground">{t('plugins.listDescription')}</Text>
        {!entries.length && (catalog.isLoading || connections.isLoading) ? (
          <ContentState.Loading title={t('plugins.loading')} />
        ) : null}
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
            const connection = connections.data?.find((item) => item.pluginId === id);
            const name = entry ? t(`plugins.catalog.${id}.name`) : id;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={name}
                key={id}
                className="flex-row items-center gap-3 rounded-xl py-5 active:bg-secondary"
                onPress={() =>
                  router.push({ pathname: '/plugins/[pluginId]', params: { pluginId: id } })
                }
                testID={`plugin-${id}`}
              >
                <PluginIcon icon={entry?.icon} />
                <View className="min-w-0 flex-1 gap-2">
                  <View className="flex-row flex-wrap items-center gap-2">
                    <Text className="text-base font-semibold text-foreground">{name}</Text>
                    {connection ? (
                      <Text
                        className={
                          (connection.authorization?.status ?? 'connected') === 'connected'
                            ? 'text-xs text-success'
                            : 'text-xs text-error'
                        }
                      >
                        {t(
                          `plugins.connectionStatus.${connection.authorization?.status ?? 'connected'}`,
                        )}
                      </Text>
                    ) : null}
                  </View>
                  <Text className="text-sm text-muted-foreground">
                    {entry ? t(`plugins.catalog.${id}.summary`) : t('plugins.unavailable')}
                  </Text>
                </View>
                <ChevronRightIcon className="size-5 text-muted-foreground" />
              </Pressable>
            );
          })}
        </View>
      </PluginPage>
    </>
  );
}
