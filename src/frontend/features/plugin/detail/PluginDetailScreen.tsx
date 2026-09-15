import CheckIcon from '@cherrystudio/app-icons/icons/check';
import CircleAlertIcon from '@cherrystudio/app-icons/icons/circle-alert';
import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import SquareArrowOutUpRightIcon from '@cherrystudio/app-icons/icons/square-arrow-out-up-right';
import { Button, ContentState, useAlert, useToast } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { useBackendModule } from '@/frontend/data';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';
import type { PluginDisconnectResult } from '@/shared/contracts/plugins';
import { PluginIdSchema, type PluginId } from '@/shared/data/types/plugin';

import { PluginIdentity } from '../components/PluginIdentity';
import { PluginPage } from '../components/PluginPage';
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
  const connectionStatus = connection?.authorization?.status ?? 'connected';
  const managementUrl = connection?.authorization?.managementUrl;
  const isLoading = catalog.isLoading || connections.isLoading;
  const hasLoadError =
    (catalog.isError && !catalog.data) || (connections.isError && !connections.data);

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

  return (
    <>
      <RouteHeader
        title={name}
        rightActions={
          connection
            ? [
                {
                  key: 'connection-actions',
                  type: 'menu',
                  icon: EllipsisIcon,
                  accessibilityLabel: t('common.more'),
                  disabled: isDisconnecting,
                  testID: 'plugin-connection-actions',
                  items: [
                    ...(managementUrl
                      ? [
                          {
                            id: 'manage-authorization',
                            label: t('plugins.authorization.manageAuthorization'),
                            onPress: () => void openExternalUrl(managementUrl),
                          },
                        ]
                      : []),
                    {
                      id: 'plugin-disconnect',
                      label: t('plugins.disconnect'),
                      destructive: true,
                      disabled: isDisconnecting,
                      onPress: () =>
                        alert.confirm({
                          title: t('plugins.disconnectTitle', { name }),
                          description: t('plugins.disconnectMessage'),
                          confirmLabel: t('plugins.disconnect'),
                          role: 'destructive',
                          onConfirm: () => void disconnect(),
                        }),
                    },
                  ],
                },
              ]
            : undefined
        }
      />
      <PluginPage
        testID={`plugin-detail-${pluginId}`}
        footer={
          hasLoadError ? (
            <Button
              size="lg"
              onPress={() => void Promise.all([catalog.refetch(), connections.refetch()])}
            >
              {t('common.retry')}
            </Button>
          ) : entry && !isLoading ? (
            <Button
              size="lg"
              disabled={isDisconnecting}
              onPress={() =>
                router.push({ pathname: '/plugins/[pluginId]/connect', params: { pluginId } })
              }
              testID={connection ? 'plugin-reconnect' : 'plugin-add'}
            >
              {t(connection ? 'plugins.reconnect' : 'plugins.connect')}
            </Button>
          ) : null
        }
      >
        {isLoading ? (
          <ContentState.Loading title={t('plugins.loading')} />
        ) : hasLoadError ? (
          <ContentState.Error title={t('plugins.loadFailed')} />
        ) : !entry && !connection ? (
          <ContentState.Empty title={t('plugins.notFound')} />
        ) : (
          <>
            {entry ? (
              <PluginIdentity entry={entry} />
            ) : (
              <View className="gap-2">
                <Text className="text-2xl font-semibold text-foreground">{name}</Text>
                <Text className="text-sm text-muted-foreground">
                  {t('plugins.unavailableDescription')}
                </Text>
              </View>
            )}
            {connection ? (
              <View className="gap-3 rounded-2xl bg-secondary p-5">
                <View className="flex-row items-center gap-2">
                  {connectionStatus === 'connected' ? (
                    <CheckIcon className="size-4 text-success" />
                  ) : (
                    <CircleAlertIcon className="size-4 text-error" />
                  )}
                  <Text
                    className={
                      connectionStatus === 'connected'
                        ? 'text-sm font-medium text-success'
                        : 'text-sm font-medium text-error'
                    }
                  >
                    {t(`plugins.connectionStatus.${connectionStatus}`)}
                  </Text>
                </View>
                <Text className="text-lg font-semibold text-foreground">
                  {connection.accountLabel}
                </Text>
                {connection.authorization?.reason ? (
                  <Text className="text-sm text-muted-foreground">
                    {t(`plugins.errors.${connection.authorization.reason}`)}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {disconnectResult?.revocation === 'unconfirmed' && !connection ? (
              <View className="gap-3">
                <Text className="text-sm text-muted-foreground">
                  {t('plugins.authorization.revocationUnconfirmed')}
                </Text>
                {disconnectResult.managementUrl ? (
                  <Button
                    variant="outline"
                    onPress={() => void openExternalUrl(disconnectResult.managementUrl!)}
                  >
                    {t('plugins.authorization.manageAuthorization')}
                  </Button>
                ) : null}
              </View>
            ) : null}
            {entry ? (
              <>
                <View className="gap-3">
                  <Text
                    accessibilityRole="header"
                    className="text-base font-semibold text-foreground"
                  >
                    {t('plugins.capabilities')}
                  </Text>
                  <Text className="text-base text-foreground">
                    {t(`plugins.catalog.${pluginId}.description`)}
                  </Text>
                </View>
                <View className="gap-4">
                  <Text
                    accessibilityRole="header"
                    className="text-base font-semibold text-foreground"
                  >
                    {t('plugins.examples.title')}
                  </Text>
                  <Text className="text-base text-foreground">
                    {t(`plugins.catalog.${pluginId}.examples.first`)}
                  </Text>
                  <Text className="text-base text-foreground">
                    {t(`plugins.catalog.${pluginId}.examples.second`)}
                  </Text>
                  <Text className="text-sm text-muted-foreground">{t('plugins.usage')}</Text>
                </View>
                <View className="gap-3">
                  <Text
                    accessibilityRole="header"
                    className="text-base font-semibold text-foreground"
                  >
                    {t('plugins.privacy')}
                  </Text>
                  <Text className="text-sm text-muted-foreground">
                    {t(`plugins.catalog.${pluginId}.access`)}
                  </Text>
                  <Text className="text-sm text-muted-foreground">
                    {t('plugins.privacyDescription')}
                  </Text>
                  <View className="flex-row flex-wrap items-start gap-4">
                    <Button
                      size="inline"
                      icon={<SquareArrowOutUpRightIcon />}
                      variant="link"
                      onPress={() => void openExternalUrl(entry.links.website)}
                    >
                      {t('plugins.website')}
                    </Button>
                    <Button
                      size="inline"
                      icon={<SquareArrowOutUpRightIcon />}
                      variant="link"
                      onPress={() => void openExternalUrl(entry.links.privacy)}
                    >
                      {t('plugins.privacyPolicy')}
                    </Button>
                  </View>
                </View>
              </>
            ) : null}
          </>
        )}
      </PluginPage>
    </>
  );
}
