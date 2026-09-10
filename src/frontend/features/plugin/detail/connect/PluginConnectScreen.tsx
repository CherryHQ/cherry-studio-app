import { Button, ContentState } from '@cherrystudio/ui/components';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { PluginIdSchema, type PluginCatalogEntry } from '@/shared/data/types/plugin';

import { usePluginCatalog } from '../../usePluginCatalog';
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
  const [methodId, setMethodId] = useState(entry.authMethods[0]?.id);
  const method = entry.authMethods.find((candidate) => candidate.id === methodId);
  if (!method) return <ContentState.Empty title={t('plugins.unavailable')} />;
  const alternatives = (
    <View className="gap-2">
      {entry.authMethods
        .filter((candidate) => candidate.id !== method.id)
        .map((candidate) => (
          <Button key={candidate.id} variant="link" onPress={() => setMethodId(candidate.id)}>
            {t(`plugins.catalog.${entry.id}.authMethods.${candidate.id}.label`)}
          </Button>
        ))}
    </View>
  );
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
