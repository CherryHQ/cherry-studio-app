import { PlusIcon } from '@cherrystudio/app-icons';
import { Button } from '@cherrystudio/ui/components';
import type { McpServer } from '@cherrystudio/universal/data/types/mcpServer';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { BackHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
import { useMcpServerRuntimeSummaries, useMcpServersApi } from '@/frontend/hooks/mcp/useMcpServers';
import type { McpServerRuntimeSummary } from '@/shared/contracts';

import { SettingsServiceRow } from '../components/SettingsServiceRow';

export function McpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { error, isLoading, refetch, servers } = useMcpServersApi();
  const { summaries } = useMcpServerRuntimeSummaries(servers);
  const [pressedServerId, setPressedServerId] = useState<string>();

  const handleServerPressedChange = useCallback((id: string, isPressed: boolean) => {
    setPressedServerId((currentId) => (isPressed ? id : currentId === id ? undefined : currentId));
  }, []);

  const openCreate = useCallback(() => {
    router.push({ pathname: './mcp/[serverId]', params: { serverId: 'new' } });
  }, [router]);

  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('settings.mcp.addServer'),
        androidIcon: PlusIcon,
        icon: 'plus',
        key: 'create-mcp-server',
        onPress: openCreate,
      },
    ],
    [openCreate, t],
  );

  return (
    <>
      <BackHeader rightActions={rightActions} title={t('settings.pages.mcp.title')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentContainerClassName="flex-grow gap-6 px-4 py-5"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View className="items-center gap-2 px-1 py-8">
            <ActivityIndicator size="small" />
            <Text className="text-foreground text-sm">{t('settings.mcp.list.loading')}</Text>
          </View>
        ) : error ? (
          <View className="items-center gap-3 px-1 py-8">
            <Text className="text-destructive-foreground text-sm">
              {t('settings.mcp.list.loadFailed')}
            </Text>
            <Text className="text-center text-foreground text-xs" selectable>
              {error instanceof Error ? error.message : String(error)}
            </Text>
            <Button size="sm" variant="secondary" onPress={() => void refetch()}>
              {t('settings.mcp.retry')}
            </Button>
          </View>
        ) : servers.length === 0 ? (
          <View className="flex-1 items-center justify-center gap-4 px-6 pb-20">
            <Text className="text-center text-base text-foreground">{t('settings.mcp.empty')}</Text>
            <Button onPress={openCreate} testID="mcp-empty-create" variant="default">
              <Button.Label>{t('settings.mcp.emptyAction')}</Button.Label>
            </Button>
          </View>
        ) : (
          <View className="overflow-hidden rounded-2xl bg-grouped-surface">
            {servers.map((server, index) => {
              const previousServerId = servers[index - 1]?.id;
              const summary = summaries[server.id];
              const status = getServerStatus(server, summary);

              return (
                <SettingsServiceRow
                  id={server.id}
                  hideSeparator={
                    pressedServerId === server.id || pressedServerId === previousServerId
                  }
                  key={server.id}
                  name={server.name}
                  showSeparator={index > 0}
                  onPress={() =>
                    router.push({
                      pathname: './mcp/[serverId]',
                      params: { serverId: server.id },
                    })
                  }
                  onPressedChange={handleServerPressedChange}
                  statusLabel={t(`settings.mcp.list.status.${status}`)}
                  statusTone={
                    status === 'connected' ? 'success' : status === 'error' ? 'danger' : 'default'
                  }
                  subtitle={getServerSubtitle(summary, (count) =>
                    t('settings.mcp.list.toolCount', { count }),
                  )}
                />
              );
            })}
          </View>
        )}
      </ScrollView>
    </>
  );
}

function getServerStatus(
  server: McpServer,
  summary: McpServerRuntimeSummary | undefined,
): McpServerRuntimeSummary['state'] {
  if (!server.isEnabled) {
    return 'disabled';
  }
  return summary?.state ?? 'connecting';
}

function getServerSubtitle(
  summary: McpServerRuntimeSummary | undefined,
  formatToolCount: (count: number) => string,
): string | undefined {
  const details: string[] = [];

  if (summary?.toolCount !== undefined) {
    details.push(formatToolCount(summary.toolCount));
  }
  if (summary?.serverVersion) {
    details.push(formatServerVersion(summary.serverVersion));
  }

  return details.length > 0 ? details.join(' · ') : undefined;
}

function formatServerVersion(version: string): string {
  return /^\d/.test(version) ? `v${version}` : version;
}
