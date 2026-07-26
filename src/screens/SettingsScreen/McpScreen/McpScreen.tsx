import { useRouter } from 'expo-router';
import { PlusIcon } from 'lucide-uniwind/png';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import type { McpServerRuntimeSummary } from '@/ai/mcp';
import { BackHeader, type HeaderToolbarAction } from '@/components/headers';
import type { StreamableHttpMcpServer } from '@/data/types/mcpServer';
import { useMcpServerRuntimeSummaries, useMcpServersApi } from '@/hooks/mcp/useMcpServers';
import { SettingsDialogActionButton } from '../components/SettingsDialogActionButton';
import { SettingsServiceRow } from '../components/SettingsServiceRow';

export function McpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { servers } = useMcpServersApi();
  const { summaries } = useMcpServerRuntimeSummaries(servers);

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
        contentContainerClassName="gap-6 px-4 py-5"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {servers.length === 0 ? (
          <View className="items-center px-1">
            <SettingsDialogActionButton
              isPrimary
              label={t('settings.mcp.emptyAction')}
              onPress={openCreate}
            />
          </View>
        ) : (
          <View className="overflow-hidden rounded-xl bg-settings-grouped-surface">
            {servers.map((server) => {
              const summary = summaries[server.id];
              const status = getServerStatus(server, summary);

              return (
                <SettingsServiceRow
                  id={server.id}
                  isEnabled={server.isActive}
                  key={server.id}
                  name={server.name}
                  onPress={() =>
                    router.push({
                      pathname: './mcp/[serverId]',
                      params: { serverId: server.id },
                    })
                  }
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
  server: StreamableHttpMcpServer,
  summary: McpServerRuntimeSummary | undefined,
): McpServerRuntimeSummary['state'] {
  if (!server.isActive) {
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
