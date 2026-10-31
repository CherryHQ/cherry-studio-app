import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { PluginIcon } from '@/frontend/components/PluginIcon';
import { PolicyScope } from '@/frontend/components/Policy';
import { useMcpIcon } from '@/frontend/hooks/mcp/useMcpIcon';
import { useMcpServerRuntimeSummaries, useMcpServersApi } from '@/frontend/hooks/mcp/useMcpServers';
import type { McpServerRuntimeSummary } from '@/shared/contracts';
import { managedResourcePolicy } from '@/shared/data/managedPolicy';
import type { McpServer } from '@/shared/data/types/mcpServer';

import { PluginGroup } from './PluginGroup';
import { PluginRow } from './PluginRow';

/**
 * User-added MCP servers, each opening its editor, followed by the Custom entry that creates one.
 * Built-in servers are listed as plugins.
 */
export function McpServerGroup() {
  const { t } = useTranslation();
  const router = useRouter();
  const mcpIcon = useMcpIcon();
  const { servers: allServers } = useMcpServersApi();
  const servers = useMemo(
    () => allServers.filter((server) => server.origin !== 'builtin'),
    [allServers],
  );
  const { summaries } = useMcpServerRuntimeSummaries(servers);
  const openServer = (serverId: string) =>
    router.push({ pathname: '/plugins/mcp/[serverId]', params: { serverId } });

  return (
    <PluginGroup testID="plugins-mcp" title={t('plugins.mcp.title')}>
      {servers.map((server) => {
        const summary = summaries[server.id];
        const status = getServerStatus(server, summary);
        return (
          <PolicyScope key={server.id} policy={managedResourcePolicy(server)}>
            <PluginRow
              description={
                summary?.toolCount === undefined
                  ? undefined
                  : t('settings.mcp.list.toolCount', { count: summary.toolCount })
              }
              icon={<PluginIcon source={mcpIcon} />}
              onPress={() => openServer(server.id)}
              status={{
                label: t(`settings.mcp.list.status.${status}`),
                tone:
                  status === 'connected' ? 'success' : status === 'error' ? 'danger' : 'default',
              }}
              testID={`plugins-mcp-${server.id}`}
              title={server.name}
            />
          </PolicyScope>
        );
      })}
      <PluginRow
        addAction={{
          accessibilityLabel: t('settings.mcp.addServer'),
          onPress: () => openServer('new'),
        }}
        description={t('plugins.custom.summary')}
        icon={<PluginIcon source={mcpIcon} />}
        onPress={() => openServer('new')}
        testID="plugins-mcp-create"
        title={t('plugins.custom.name')}
      />
    </PluginGroup>
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
