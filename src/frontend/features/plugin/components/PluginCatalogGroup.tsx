import { ContentState } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { PluginIcon } from '@/frontend/components/PluginIcon';
import { usePluginCatalog, usePluginConnections } from '@/frontend/hooks/plugin';

import { PluginGroup } from './PluginGroup';
import { PluginRow } from './PluginRow';

export function PluginCatalogGroup() {
  const { t } = useTranslation();
  const router = useRouter();
  const catalog = usePluginCatalog();
  const connections = usePluginConnections();
  const entries = catalog.data ?? [];
  const connectedIds = new Set((connections.data ?? []).map((item) => item.pluginId));
  // Connected plugins lead so their status reads as one column; the rest keep catalog order.
  const ids = [...new Set([...entries.map((item) => item.id), ...connectedIds])].sort(
    (a, b) => Number(connectedIds.has(b)) - Number(connectedIds.has(a)),
  );

  return (
    <PluginGroup testID="plugins-catalog" title={t('plugins.title')}>
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
      {ids.map((id) => {
        const entry = entries.find((item) => item.id === id);
        const connection = connections.data?.find((item) => item.pluginId === id);
        const status = connection?.authorization?.status ?? 'connected';
        const title = entry ? t(`plugins.catalog.${id}.name`) : id;
        return (
          <PluginRow
            addAction={
              entry && !connection
                ? {
                    accessibilityLabel: t('plugins.connectTitle', { name: title }),
                    onPress: () =>
                      router.push({
                        pathname: '/plugins/[pluginId]/connect',
                        params: { pluginId: id },
                      }),
                  }
                : undefined
            }
            description={entry ? t(`plugins.catalog.${id}.summary`) : t('plugins.unavailable')}
            icon={<PluginIcon icon={entry?.icon} />}
            key={id}
            onPress={() =>
              router.push({ pathname: '/plugins/[pluginId]', params: { pluginId: id } })
            }
            status={
              connection
                ? {
                    label: t(`plugins.connectionStatus.${status}`),
                    tone: status === 'connected' ? 'success' : 'danger',
                  }
                : undefined
            }
            testID={`plugin-${id}`}
            title={title}
          />
        );
      })}
    </PluginGroup>
  );
}
