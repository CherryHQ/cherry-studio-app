import { useQuery } from '@tanstack/react-query';
import { Spinner } from 'heroui-native/spinner';
import { Switch } from 'heroui-native/switch';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { matchesMcpSourceToolRule } from '@/ai/tools/mcpSourcePolicy';
import { queryKeys } from '@/data/api';
import { useDataServices } from '@/data/runtime';
import type { McpServer } from '@/data/types/mcpServer';
import { SettingsDialogActionButton } from '../../components/SettingsDialogActionButton';

type McpToolsSectionProps = {
  disabledTools: string[];
  onToggleTool: (toolName: string, enabled: boolean) => void;
  server: McpServer;
};

export function McpToolsSection({ disabledTools, onToggleTool, server }: McpToolsSectionProps) {
  const { t } = useTranslation();
  const services = useDataServices();
  // Matches raw names, wire ids and server wildcards alike — `disabledTools`
  // here is unsaved form state, so it can't go through the server row.
  const isDisabled = (toolName: string) =>
    disabledTools.some((value) => matchesMcpSourceToolRule(value, server, { name: toolName }));

  const toolsQuery = useQuery({
    queryFn: () => services.mcp.listToolsForServer(server),
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
        <Text className="text-default-foreground text-sm">{t('settings.mcp.tools.loading')}</Text>
      </View>
    );
  }

  if (toolsQuery.isError) {
    return (
      <View className="gap-2">
        <Text className="text-danger-foreground text-sm">{t('settings.mcp.tools.loadFailed')}</Text>
        <SettingsDialogActionButton label={t('settings.mcp.tools.retry')} onPress={refetch} />
      </View>
    );
  }

  const tools = toolsQuery.data ?? [];

  if (tools.length === 0) {
    return <Text className="text-default-foreground text-sm">{t('settings.mcp.tools.empty')}</Text>;
  }

  return (
    <View className="gap-3">
      {tools.map((tool) => (
        <View className="flex-row items-center justify-between gap-4" key={tool.name}>
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="font-mono text-foreground text-sm" numberOfLines={1}>
              {tool.name}
            </Text>
            {tool.description ? (
              <Text className="text-default-foreground text-xs" numberOfLines={2}>
                {tool.description}
              </Text>
            ) : null}
          </View>
          <Switch
            isSelected={!isDisabled(tool.name)}
            onSelectedChange={(enabled) => onToggleTool(tool.name, enabled)}
          />
        </View>
      ))}
    </View>
  );
}
