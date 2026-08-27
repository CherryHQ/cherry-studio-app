import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import { ContentState, Image } from '@cherrystudio/ui/components';
import { resolveProviderIcon } from '@cherrystudio/ui/icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useUniwind } from 'uniwind';

import type { HeaderToolbarAction } from '@/frontend/components/headers';
import { InlineSearch, useInlineSearch } from '@/frontend/components/inlineSearch';
import { useMcpServerRuntimeSummaries, useMcpServersApi } from '@/frontend/hooks/mcp/useMcpServers';
import type { McpServerRuntimeSummary } from '@/shared/contracts';
import type { McpServer } from '@/shared/data/types/mcpServer';

import { SettingsScrollPage } from '../components/SettingsScrollPage';
import { SettingsServiceRow } from '../components/SettingsServiceRow';

export function McpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { theme } = useUniwind();
  // The same mark the settings list uses for this row, so the empty state names
  // the thing it is empty of rather than standing in for it with a glyph.
  const mcpIcon = resolveProviderIcon('mcp')?.[theme === 'dark' ? 'dark' : 'light'];
  const { error, isLoading, refetch, servers } = useMcpServersApi();
  const { summaries } = useMcpServerRuntimeSummaries(servers);
  const [pressedServerId, setPressedServerId] = useState<string>();
  // The endpoint is searchable alongside the name: a server is often easier to
  // recall by the host it points at than by whatever it was named on creation.
  const {
    query,
    results: listedServers,
    setQuery,
  } = useInlineSearch({
    fields: (server: McpServer) => [server.name, server.endpointUrl],
    items: servers,
  });

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
        icon: PlusIcon,
        key: 'create-mcp-server',
        onPress: openCreate,
        type: 'icon',
      },
    ],
    [openCreate, t],
  );

  return (
    <SettingsScrollPage
      contentClassName="flex-grow gap-6"
      headerProps={{ rightActions, title: t('settings.pages.mcp.title') }}
      search={<InlineSearch onChangeText={setQuery} value={query} />}
    >
      {isLoading ? (
        <ContentState.Loading className="px-1 py-8" title={t('settings.mcp.list.loading')} />
      ) : error ? (
        <ContentState.Error
          className="px-1 py-8"
          description={error instanceof Error ? error.message : String(error)}
          primaryAction={{
            children: t('settings.mcp.retry'),
            onPress: () => void refetch(),
          }}
          title={t('settings.mcp.list.loadFailed')}
        />
      ) : servers.length === 0 ? (
        <ContentState.Empty
          description={t('settings.mcp.emptyDescription')}
          icon={
            mcpIcon ? (
              <ContentState.Icon>
                <Image
                  cachePolicy="memory-disk"
                  className="size-7"
                  contentFit="contain"
                  source={mcpIcon}
                />
              </ContentState.Icon>
            ) : null
          }
          layout="page"
          primaryAction={{
            children: t('settings.mcp.emptyAction'),
            onPress: openCreate,
            testID: 'mcp-empty-create',
          }}
          title={t('settings.mcp.empty')}
        />
      ) : listedServers.length === 0 ? (
        <ContentState.Empty className="px-6 py-8" title={t('settings.mcp.list.noResults')} />
      ) : (
        <View className="overflow-hidden rounded-2xl bg-grouped-surface">
          {listedServers.map((server, index) => {
            const previousServerId = listedServers[index - 1]?.id;
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
    </SettingsScrollPage>
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
