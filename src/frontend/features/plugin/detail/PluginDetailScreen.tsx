import CheckIcon from '@cherrystudio/app-icons/icons/check';
import CircleAlertIcon from '@cherrystudio/app-icons/icons/circle-alert';
import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import SquareArrowOutUpRightIcon from '@cherrystudio/app-icons/icons/square-arrow-out-up-right';
import { ActionMenu, Button, ContentState, useAlert, useToast } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { MarkdownText } from '@/frontend/components/MarkdownText';
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
  const connectionStatus = connection?.authorization?.status ?? 'connected';
  const managementUrl = connection?.authorization?.managementUrl;

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
        contentContainerClassName="gap-6 px-6 py-6"
        contentInsetAdjustmentBehavior="automatic"
        testID={`plugin-detail-${pluginId}`}
      >
        <View className="gap-3">
          <View className="flex-row items-center gap-3">
            <PluginIcon icon={entry?.icon} size="large" />
            <Text className="flex-1 text-2xl font-semibold text-foreground">{name}</Text>
          </View>
          <Text className="text-sm text-muted-foreground">
            {entry
              ? t(`plugins.catalog.${pluginId}.description`)
              : t('plugins.unavailableDescription')}
          </Text>
        </View>
        {disconnectResult?.revocation === 'unconfirmed' && !connection ? (
          <View className="gap-3">
            <Text className="text-sm text-muted-foreground">
              {t('plugins.authorization.revocationUnconfirmed')}
            </Text>
            {disconnectResult.managementUrl ? (
              <Button
                icon={<SquareArrowOutUpRightIcon />}
                variant="outline"
                onPress={() => void openExternalUrl(disconnectResult.managementUrl!)}
              >
                {t('plugins.authorization.manageAuthorization')}
              </Button>
            ) : null}
          </View>
        ) : null}
        {connection ? (
          <View className="gap-4">
            <View className="flex-row items-center gap-3">
              <View className="min-w-0 flex-1 gap-1">
                <View className="flex-row items-center gap-2">
                  {connectionStatus === 'connected' ? (
                    <CheckIcon className="size-4 text-success" />
                  ) : (
                    <CircleAlertIcon className="size-4 text-destructive" />
                  )}
                  <Text
                    className={
                      connectionStatus === 'connected'
                        ? 'flex-1 text-sm text-muted-foreground'
                        : 'flex-1 text-sm text-destructive'
                    }
                  >
                    {t(`plugins.connectionStatus.${connectionStatus}`)}
                  </Text>
                </View>
                <Text className="text-base font-medium text-foreground">
                  {connection.accountLabel}
                </Text>
              </View>
              <ActionMenu
                items={[
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
                ]}
              >
                <Button
                  accessibilityLabel={t('common.more')}
                  disabled={isDisconnecting}
                  icon={<EllipsisIcon />}
                  loading={isDisconnecting}
                  testID="plugin-connection-actions"
                  variant="ghost"
                />
              </ActionMenu>
            </View>
            {connection.authorization?.reason ? (
              <Text className="text-sm text-muted-foreground">
                {t(`plugins.errors.${connection.authorization.reason}`)}
              </Text>
            ) : null}
            {entry || managementUrl ? (
              <View className="gap-3">
                {entry ? (
                  <Button
                    disabled={isDisconnecting}
                    onPress={() =>
                      router.push({ pathname: '/plugins/[pluginId]/connect', params: { pluginId } })
                    }
                  >
                    {t('plugins.reconnect')}
                  </Button>
                ) : null}
                {managementUrl ? (
                  <Button
                    disabled={isDisconnecting}
                    icon={<SquareArrowOutUpRightIcon />}
                    variant="outline"
                    onPress={() => void openExternalUrl(managementUrl)}
                  >
                    {t('plugins.authorization.manageAuthorization')}
                  </Button>
                ) : null}
              </View>
            ) : null}
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
        {entry?.guide ? <PluginGuide content={entry.guide.content} /> : null}
        {entry ? (
          <View className="gap-3">
            <Text className="text-base font-medium text-foreground">{t('plugins.privacy')}</Text>
            <Text className="text-sm text-muted-foreground">
              {t(`plugins.catalog.${pluginId}.access`)}
            </Text>
            <Text className="text-sm text-muted-foreground">{t('plugins.privacyDescription')}</Text>
            <View className="flex-row items-start gap-3">
              <View className="min-w-0 flex-1">
                <Button
                  icon={<SquareArrowOutUpRightIcon />}
                  variant="ghost"
                  onPress={() => void openExternalUrl(entry.links.website)}
                >
                  {t('plugins.website')}
                </Button>
              </View>
              <View className="min-w-0 flex-1">
                <Button
                  icon={<SquareArrowOutUpRightIcon />}
                  variant="ghost"
                  onPress={() => void openExternalUrl(entry.links.privacy)}
                >
                  {t('plugins.privacyPolicy')}
                </Button>
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </>
  );
}

function PluginGuide({ content }: { content: string }) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <View className="gap-3">
      <Text className="text-base font-medium text-foreground">{t('plugins.guide.title')}</Text>
      <Text className="text-sm text-muted-foreground">{t('plugins.guide.description')}</Text>
      <Button
        variant="outline"
        accessibilityState={{ expanded: isExpanded }}
        onPress={() => setIsExpanded((expanded) => !expanded)}
        testID="plugin-guide-toggle"
      >
        {t(isExpanded ? 'plugins.guide.hide' : 'plugins.guide.show')}
      </Button>
      {isExpanded ? <MarkdownText markdown={content} selectable={false} /> : null}
    </View>
  );
}
