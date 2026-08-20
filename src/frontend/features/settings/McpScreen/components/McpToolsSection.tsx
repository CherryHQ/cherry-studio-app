import { Button, Spinner } from '@cherrystudio/ui/components';
import type { McpServer } from '@cherrystudio/universal/data/types/mcpServer';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { queryKeys, useBackendModule } from '@/frontend/data';

type McpToolsSectionProps = {
  server: McpServer;
};

/**
 * The tools a server currently exposes. Read-only by design: which tools are
 * available is the server's answer, and whether a call may run is fixed
 * application policy (every MCP tool asks before executing), so there is
 * nothing here for the user to configure.
 */
export function McpToolsSection({ server }: McpToolsSectionProps) {
  const { t } = useTranslation();
  const mcp = useBackendModule('mcp');

  const toolsQuery = useQuery({
    enabled: /^https?:\/\//i.test(server.endpointUrl),
    queryFn: () => mcp.listTools(server.id),
    queryKey: queryKeys.mcpServers.tools(server.id),
    retry: false,
  });

  const refetch = useCallback(() => {
    void toolsQuery.refetch();
  }, [toolsQuery]);

  if (toolsQuery.isLoading) {
    return (
      <View className="flex-row items-center gap-2">
        <Spinner size="sm" />
        <Text className="text-foreground text-sm">{t('settings.mcp.tools.loading')}</Text>
      </View>
    );
  }

  if (toolsQuery.isError) {
    return (
      <View className="gap-2">
        <Text className="text-destructive-foreground text-sm">
          {t('settings.mcp.tools.loadFailed')}
        </Text>
        {/* The reason is the whole point here — an expired token and a typo'd
            URL are the same generic failure without it. */}
        <Text className="text-foreground text-xs" selectable>
          {toolsQuery.error instanceof Error ? toolsQuery.error.message : String(toolsQuery.error)}
        </Text>
        <Button size="sm" variant="secondary" onPress={refetch}>
          {t('settings.mcp.tools.retry')}
        </Button>
      </View>
    );
  }

  const tools = toolsQuery.data ?? [];
  if (tools.length === 0) {
    return <Text className="text-foreground text-sm">{t('settings.mcp.tools.empty')}</Text>;
  }

  return (
    <View className="gap-3">
      {tools.map((tool) => (
        <View className="min-w-0 gap-0.5" key={tool.name}>
          <Text className="font-mono text-foreground text-sm" numberOfLines={1}>
            {tool.name}
          </Text>
          {tool.description ? (
            <Text className="text-foreground text-xs" numberOfLines={2}>
              {tool.description}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
