import CheckIcon from '@cherrystudio/app-icons/icons/check';
import { Button, ContentState, useAlert, useToast } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { chatHref } from '@/frontend/appShell/navigation/chat';
import { AgentAvatar } from '@/frontend/components/Avatar';
import { useBackendModule, useMutation } from '@/frontend/data';
import { useAgentsApi } from '@/frontend/hooks/agent';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';
import { PluginIdSchema, type PluginConnection, type PluginId } from '@/shared/contracts/plugins';
import type { Agent } from '@/shared/data/types/agent';

import { PluginIcon } from '../components/PluginIcon';
import { PLUGIN_LINKS } from '../pluginCatalog';
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
  const connections = usePluginConnections();
  const refresh = useRefreshPluginConnections();
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const connection = connections.data?.find((item) => item.pluginId === pluginId);
  const name = t(`plugins.catalog.${pluginId}.name`);

  async function disconnect() {
    setIsDisconnecting(true);
    try {
      await plugins.disconnect(pluginId);
      await refresh();
      toast.show({ label: t('plugins.disconnected'), variant: 'success' });
    } catch {
      toast.show({ label: t('plugins.disconnectFailed'), variant: 'danger' });
    } finally {
      setIsDisconnecting(false);
    }
  }

  return (
    <>
      <RouteHeader title={name} />
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-8 px-6 py-6"
        contentInsetAdjustmentBehavior="automatic"
        testID={`plugin-detail-${pluginId}`}
      >
        <View className="gap-5">
          <PluginIcon pluginId={pluginId} size="large" />
          <View className="gap-2">
            <Text className="text-3xl font-semibold text-foreground">{name}</Text>
            <Text className="text-sm text-muted-foreground">{t('plugins.byCherry')}</Text>
            <Text className="text-lg text-foreground">
              {t(`plugins.catalog.${pluginId}.description`)}
            </Text>
          </View>
          {connections.isLoading ? (
            <ContentState.Loading title={t('plugins.loading')} />
          ) : connections.isError ? (
            <ContentState.Error
              title={t('plugins.loadFailed')}
              primaryAction={{
                children: t('common.retry'),
                onPress: () => void connections.refetch(),
              }}
            />
          ) : connection ? (
            <View className="flex-row items-center gap-2">
              <CheckIcon className="size-5 text-success" />
              <Text className="text-base text-foreground">
                {t('plugins.connectedAccount', { account: connection.accountLabel })}
              </Text>
            </View>
          ) : (
            <Button
              size="lg"
              shape="pill"
              onPress={() =>
                router.push({ pathname: '/plugins/[pluginId]/connect', params: { pluginId } })
              }
              testID="plugin-add"
            >
              {t('plugins.add')}
            </Button>
          )}
        </View>
        {connection ? <PluginAgents connection={connection} /> : null}
        <View className="gap-4">
          <Text className="text-xl font-semibold text-foreground">{t('plugins.examples')}</Text>
          {[1, 2, 3].map((index) => (
            <View key={index} className="rounded-2xl bg-secondary px-4 py-4">
              <Text className="text-base text-foreground">
                {t(`plugins.catalog.${pluginId}.example${index}`)}
              </Text>
            </View>
          ))}
        </View>
        <View className="gap-3">
          <Text className="text-xl font-semibold text-foreground">{t('plugins.capabilities')}</Text>
          <Text className="text-base text-muted-foreground">
            {t(`plugins.catalog.${pluginId}.capabilities`)}
          </Text>
        </View>
        <View className="gap-3">
          <Text className="text-xl font-semibold text-foreground">{t('plugins.privacy')}</Text>
          <Text className="text-sm text-muted-foreground">{t('plugins.privacyDescription')}</Text>
          <Text className="text-sm text-muted-foreground">
            {t(`plugins.catalog.${pluginId}.access`)}
          </Text>
          <View className="flex-row flex-wrap gap-4">
            <Button
              variant="link"
              size="inline"
              onPress={() => void openExternalUrl(PLUGIN_LINKS[pluginId].website)}
            >
              {t('plugins.website')}
            </Button>
            <Button
              variant="link"
              size="inline"
              onPress={() => void openExternalUrl(PLUGIN_LINKS[pluginId].privacy)}
            >
              {t('plugins.privacyPolicy')}
            </Button>
          </View>
        </View>
        {connection ? (
          <View className="gap-3">
            <Button
              variant="outline"
              onPress={() =>
                router.push({ pathname: '/plugins/[pluginId]/connect', params: { pluginId } })
              }
            >
              {t('plugins.reconnect')}
            </Button>
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
        ) : null}
      </ScrollView>
    </>
  );
}

function PluginAgents({ connection }: { connection: PluginConnection }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { agents, isLoading, error, refetch } = useAgentsApi();
  return (
    <View className="gap-3">
      <Text className="text-xl font-semibold text-foreground">{t('plugins.useWithAgent')}</Text>
      <Text className="text-sm text-muted-foreground">{t('plugins.agentHelp')}</Text>
      {isLoading ? (
        <ContentState.Loading title={t('plugins.loading')} />
      ) : error ? (
        <ContentState.Error
          title={t('plugins.loadFailed')}
          primaryAction={{ children: t('common.retry'), onPress: () => void refetch() }}
        />
      ) : agents.length === 0 ? (
        <Button onPress={() => router.push('/agents/new')}>{t('plugins.createAgent')}</Button>
      ) : (
        agents.map((agent) => (
          <PluginAgentRow key={agent.id} agent={agent} connection={connection} />
        ))
      )}
    </View>
  );
}

function PluginAgentRow({ agent, connection }: { agent: Agent; connection: PluginConnection }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const bind = useMutation('POST', '/agents/:agentId/tool-bindings', {
    refresh: [`/agents/${agent.id}/tool-bindings`],
  });
  async function startChat() {
    try {
      await bind.trigger({
        params: { agentId: agent.id },
        body: {
          source: 'mcp',
          serverId: connection.serverId,
          enabled: true,
          approval: 'ask',
          displayNameSnapshot: t(`plugins.catalog.${connection.pluginId}.name`),
        },
      });
      router.dismissTo(chatHref({ agentId: agent.id, kind: 'draft' }));
    } catch {
      toast.show({ label: t('plugins.useFailed'), variant: 'danger' });
    }
  }
  return (
    <View className="flex-row items-center gap-3 py-2">
      <AgentAvatar name={agent.name} uri={agent.avatarUri} />
      <View className="flex-1 gap-1">
        <Text className="text-base font-medium text-foreground">{agent.name}</Text>
        <Text className="text-xs text-muted-foreground">
          {agent.modelName ?? t('plugins.noModel')}
        </Text>
      </View>
      <Button
        shape="pill"
        size="sm"
        disabled={!agent.modelId}
        loading={bind.isLoading}
        onPress={() => void startChat()}
        testID={`plugin-use-${agent.id}`}
      >
        {t('plugins.use')}
      </Button>
    </View>
  );
}
