import { Button, ContentState } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { PluginIdSchema, type PluginCatalogEntry } from '@/shared/data/types/plugin';

import { usePluginCatalog } from '../../usePluginCatalog';
import { usePluginConnections } from '../../usePluginConnections';
import { CredentialConnect } from './CredentialConnect';
import { InteractiveConnect } from './InteractiveConnect';

export function PluginConnectScreen() {
  const { pluginId } = useLocalSearchParams<{ pluginId: string }>();
  const parsed = PluginIdSchema.safeParse(pluginId);
  const { t } = useTranslation();
  const catalog = usePluginCatalog();
  if (!parsed.success) return <ContentState.Empty title={t('plugins.notFound')} />;
  if (catalog.isLoading) return <ContentState.Loading title={t('plugins.loading')} />;
  if (catalog.isError)
    return (
      <ContentState.Error
        title={t('plugins.loadFailed')}
        primaryAction={{ children: t('common.retry'), onPress: () => void catalog.refetch() }}
      />
    );
  const entry = catalog.data?.find((item) => item.id === parsed.data);
  if (!entry) return <ContentState.Empty title={t('plugins.unavailable')} />;
  return <PluginConnect key={entry.id} entry={entry} />;
}

function PluginConnect({ entry }: { entry: PluginCatalogEntry }) {
  const { t } = useTranslation();
  const connections = usePluginConnections();
  const router = useRouter();
  const [methodId, setMethodId] = useState(entry.authMethods[0]?.id);
  const method = entry.authMethods.find((candidate) => candidate.id === methodId);
  if (!method) return <ContentState.Empty title={t('plugins.unavailable')} />;
  const alternatives =
    entry.authMethods.length > 1 ? (
      <View className="gap-3">
        {entry.authMethods
          .filter((candidate) => candidate.id !== method.id)
          .map((candidate) => (
            <Button
              key={candidate.id}
              size="lg"
              variant="outline"
              onPress={() => setMethodId(candidate.id)}
            >
              {t(`plugins.catalog.${entry.id}.authMethods.${candidate.id}.label`)}
            </Button>
          ))}
      </View>
    ) : null;
  if (method.kind === 'credentials' && method.requiresDisconnect) {
    if (connections.isLoading) return <ContentState.Loading title={t('plugins.loading')} />;
    if (connections.isError)
      return (
        <ContentState.Error
          title={t('plugins.loadFailed')}
          primaryAction={{ children: t('common.retry'), onPress: () => void connections.refetch() }}
        />
      );
    if (connections.data?.some((connection) => connection.pluginId === entry.id))
      return (
        <View className="flex-1 gap-4 bg-background px-6 py-6">
          <Text className="text-sm text-muted-foreground">
            {t('plugins.authorization.requiresDisconnect')}
          </Text>
          <Button
            size="lg"
            onPress={() =>
              router.dismissTo({ pathname: '/plugins/[pluginId]', params: { pluginId: entry.id } })
            }
          >
            {t('plugins.authorization.manageConnection')}
          </Button>
          {alternatives}
        </View>
      );
  }
  return method.kind === 'interactive' ? (
    <InteractiveConnect key={method.id} entry={entry} method={method}>
      {alternatives}
    </InteractiveConnect>
  ) : (
    <CredentialConnect key={method.id} entry={entry} method={method}>
      {alternatives}
    </CredentialConnect>
  );
}
