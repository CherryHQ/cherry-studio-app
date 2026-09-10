import CheckIcon from '@cherrystudio/app-icons/icons/check';
import { Button, ContentState, useAlert, useToast } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { useBackendModule } from '@/frontend/data';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';
import type { PluginDisconnectResult } from '@/shared/contracts/plugins';
import { PluginIdSchema, type PluginId } from '@/shared/data/types/plugin';

import { PluginIcon } from '../components/PluginIcon';
import { usePluginCatalog } from '../usePluginCatalog';
import { usePluginConnections, useRefreshPluginConnections } from '../usePluginConnections';

export function PluginDetailScreen() {
  const { pluginId } = useLocalSearchParams<{ pluginId: string }>();
  const parsed = PluginIdSchema.safeParse(pluginId);
  const { t } = useTranslation();
  if (!parsed.success) return <ContentState.Empty title={t('plugins.notFound')} />;
  return <PluginDetail key={parsed.data} pluginId={parsed.data} />;
}

function PluginDetail({ pluginId }: { pluginId: PluginId }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { alert } = useAlert();
  const { toast } = useToast();
  const plugins = useBackendModule('plugins');
  const catalog = usePluginCatalog();
  const connections = usePluginConnections();
  const refresh = useRefreshPluginConnections();
  const [disconnectResult, setDisconnectResult] = useState<PluginDisconnectResult | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const connection = connections.data?.find((item) => item.pluginId === pluginId);
  const entry = catalog.data?.find((item) => item.id === pluginId);
  const name = entry ? t(`plugins.catalog.${pluginId}.name`) : pluginId;

  async function disconnect() {
    setIsDisconnecting(true);
    try {
      const result = await plugins.disconnect(pluginId);
      setDisconnectResult(result);
      await refresh();
      toast.show({ label: t('plugins.disconnected'), variant: 'success' });
      if (!entry) router.back();
    } catch {
      toast.show({ label: t('plugins.disconnectFailed'), variant: 'danger' });
    } finally {
      setIsDisconnecting(false);
    }
  }

  if (catalog.isLoading || connections.isLoading)
    return <ContentState.Loading title={t('plugins.loading')} />;
  if (catalog.isError || connections.isError)
    return (
      <ContentState.Error
        title={t('plugins.loadFailed')}
        primaryAction={{
          children: t('common.retry'),
          onPress: () => void Promise.all([catalog.refetch(), connections.refetch()]),
        }}
      />
    );
  if (!entry && !connection) return <ContentState.Empty title={t('plugins.notFound')} />;

  return (
    <>
      <RouteHeader title={name} />
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-8 px-6 py-6"
        contentInsetAdjustmentBehavior="automatic"
        testID={`plugin-detail-${pluginId}`}
      >
        <View className="gap-4">
          <View className="flex-row items-center gap-3">
            <PluginIcon icon={entry?.icon} size="large" />
            <Text className="flex-1 text-2xl font-semibold text-foreground">{name}</Text>
          </View>
          <Text className="text-base text-foreground">
            {entry
              ? t(`plugins.catalog.${pluginId}.description`)
              : t('plugins.unavailableDescription')}
          </Text>
        </View>
        {entry ? (
          <View className="gap-3">
            <Text className="text-base font-medium text-foreground">{t('plugins.privacy')}</Text>
            <Text className="text-sm text-muted-foreground">
              {t(`plugins.catalog.${pluginId}.access`)}
            </Text>
            <Text className="text-sm text-muted-foreground">{t('plugins.privacyDescription')}</Text>
            <View className="flex-row flex-wrap gap-4">
              <Button
                variant="link"
                size="inline"
                onPress={() => void openExternalUrl(entry.links.website)}
              >
                {t('plugins.website')}
              </Button>
              <Button
                variant="link"
                size="inline"
                onPress={() => void openExternalUrl(entry.links.privacy)}
              >
                {t('plugins.privacyPolicy')}
              </Button>
            </View>
          </View>
        ) : null}
        {disconnectResult?.revocation === 'unconfirmed' && !connection ? (
          <View className="gap-3">
            <Text className="text-sm text-muted-foreground">
              {t('plugins.authorization.revocationUnconfirmed')}
            </Text>
            {disconnectResult.managementUrl ? (
              <Button
                variant="link"
                onPress={() => void openExternalUrl(disconnectResult.managementUrl!)}
              >
                {t('plugins.authorization.manageAuthorization')}
              </Button>
            ) : null}
          </View>
        ) : null}
        {connection ? (
          <View className="gap-4">
            <View className="flex-row items-center gap-2">
              {!connection.authorization || connection.authorization.status === 'connected' ? (
                <CheckIcon className="size-5 text-success" />
              ) : null}
              <Text className="flex-1 text-sm text-foreground">
                {t('plugins.connectedAccount', { account: connection.accountLabel })}
              </Text>
            </View>
            {connection.authorization && connection.authorization.status !== 'connected' ? (
              <Text className="text-sm text-destructive">
                {t(`plugins.connectionStatus.${connection.authorization.status}`)}
              </Text>
            ) : null}
            {connection.authorization?.reason ? (
              <Text className="text-sm text-muted-foreground">
                {t(`plugins.errors.${connection.authorization.reason}`)}
              </Text>
            ) : null}
            {connection.authorization?.managementUrl ? (
              <Button
                variant="link"
                onPress={() => void openExternalUrl(connection.authorization!.managementUrl!)}
              >
                {t('plugins.authorization.manageAuthorization')}
              </Button>
            ) : null}
            <Button variant="outline" onPress={() => router.push('/agents')}>
              {t('plugins.authorization.chooseAgents')}
            </Button>
            <View className="flex-row flex-wrap gap-3">
              {entry ? (
                <Button
                  variant="outline"
                  disabled={isDisconnecting}
                  onPress={() =>
                    router.push({ pathname: '/plugins/[pluginId]/connect', params: { pluginId } })
                  }
                >
                  {t('plugins.reconnect')}
                </Button>
              ) : null}
              <Button
                variant="ghost"
                loading={isDisconnecting}
                testID="plugin-disconnect"
                onPress={() =>
                  alert.confirm({
                    title: t('plugins.disconnectTitle', { name }),
                    description: t('plugins.disconnectMessage'),
                    confirmLabel: t('plugins.disconnect'),
                    role: 'destructive',
                    onConfirm: () => void disconnect(),
                  })
                }
              >
                {t('plugins.disconnect')}
              </Button>
            </View>
          </View>
        ) : (
          <Button
            size="lg"
            onPress={() =>
              router.push({ pathname: '/plugins/[pluginId]/connect', params: { pluginId } })
            }
            testID="plugin-add"
          >
            {t('plugins.connect')}
          </Button>
        )}
      </ScrollView>
    </>
  );
}
