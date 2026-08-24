import { ContentState, Spinner, Switch } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { queryKeys, useBackendModule } from '@/frontend/data';
import type { McpServer } from '@/shared/data/types/mcpServer';

type McpToolsSectionProps = {
  isDisabled?: boolean;
  onToggleTool: (toolName: string, enabled: boolean) => void;
  server: McpServer;
};

/**
 * The tools a server exposes, each with the switch that keeps it out of the
 * model's toolset. Only availability is configurable — whether a call may run
 * is fixed application policy (every MCP tool asks before executing).
 */
export function McpToolsSection({
  isDisabled = false,
  onToggleTool,
  server,
}: McpToolsSectionProps) {
  const { t } = useTranslation();
  const mcp = useBackendModule('mcp');
  const disabledTools = useMemo(() => new Set(server.disabledTools), [server.disabledTools]);

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
      <ContentState.Loading
        className="flex-row items-center justify-start gap-2"
        icon={<Spinner size="sm" />}
        title={t('settings.mcp.tools.loading')}
      />
    );
  }

  if (toolsQuery.isError) {
    return (
      <ContentState.Error
        className="items-start"
        // The reason is the whole point here — an expired token and a typo'd
        // URL are the same generic failure without it.
        description={
          toolsQuery.error instanceof Error ? toolsQuery.error.message : String(toolsQuery.error)
        }
        primaryAction={{ children: t('settings.mcp.tools.retry'), onPress: refetch }}
        title={t('settings.mcp.tools.loadFailed')}
      />
    );
  }

  const tools = toolsQuery.data ?? [];
  if (tools.length === 0) {
    return <ContentState.Empty className="items-start" title={t('settings.mcp.tools.empty')} />;
  }

  return (
    <View className="gap-3">
      {tools.map((tool) => (
        <View className="flex-row items-center gap-4" key={tool.name}>
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="font-mono text-foreground text-sm" numberOfLines={1}>
              {tool.name}
            </Text>
            {tool.description ? (
              <Text className="text-foreground text-xs" numberOfLines={2}>
                {tool.description}
              </Text>
            ) : null}
          </View>
          <Switch
            accessibilityLabel={t('settings.mcp.tools.enabledAccessibilityLabel', {
              tool: tool.name,
            })}
            disabled={isDisabled}
            onValueChange={(enabled) => onToggleTool(tool.name, enabled)}
            value={!disabledTools.has(tool.name)}
          />
        </View>
      ))}
    </View>
  );
}
