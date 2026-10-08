import { ContentState, Section } from '@cherrystudio/ui/components';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { McpServer } from '@/shared/data/types/mcpServer';

import { useMcpServerTools } from '../hooks/useMcpServerTools';

/**
 * The tools a server exposes, each with the switch that keeps it out of the model's toolset. Only
 * availability is configurable; whether a call may run is fixed application policy (every MCP tool
 * asks before executing). Rows stay one line of name and one of description so a server with many
 * tools still reads as a compact list.
 */
export function McpToolsSection({
  isDisabled = false,
  onToggleTool,
  server,
}: {
  isDisabled?: boolean;
  onToggleTool: (toolName: string, enabled: boolean) => void;
  server: McpServer;
}) {
  const { t } = useTranslation();
  const toolsQuery = useMcpServerTools(server);
  const tools = toolsQuery.data ?? [];
  const disabledTools = useMemo(() => new Set(server.disabledTools), [server.disabledTools]);
  const enabledCount = tools.filter((tool) => !disabledTools.has(tool.name)).length;

  return (
    <View className="gap-3">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
          {t('settings.mcp.tools.title')}
        </Text>
        {tools.length > 0 ? (
          <Text className="text-sm text-muted-foreground">
            {t('settings.mcp.tools.enabledSummary', {
              enabled: enabledCount,
              total: tools.length,
            })}
          </Text>
        ) : null}
      </View>
      {toolsQuery.isLoading ? (
        <ContentState.Loading layout="row" title={t('settings.mcp.tools.loading')} />
      ) : toolsQuery.isError ? (
        <ContentState.Error
          // The reason is the whole point here — an expired token and a typo'd URL are the same
          // generic failure without it.
          description={
            toolsQuery.error instanceof Error ? toolsQuery.error.message : String(toolsQuery.error)
          }
          layout="leading"
          primaryAction={{
            children: t('settings.mcp.tools.retry'),
            onPress: () => void toolsQuery.refetch(),
          }}
          title={t('settings.mcp.tools.loadFailed')}
        />
      ) : tools.length === 0 ? (
        <ContentState.Empty layout="leading" title={t('settings.mcp.tools.empty')} />
      ) : (
        <Section>
          {tools.map((tool) => (
            <Section.SwitchItem
              accessibilityLabel={tool.name}
              density="compact"
              description={
                tool.description ? (
                  <Text className="text-sm text-muted-foreground" numberOfLines={1}>
                    {tool.description}
                  </Text>
                ) : undefined
              }
              disabled={isDisabled}
              key={tool.name}
              label={
                <Text className="font-mono text-sm text-foreground" numberOfLines={1}>
                  {tool.name}
                </Text>
              }
              onValueChange={(enabled) => onToggleTool(tool.name, enabled)}
              testID={`mcp-tool-${tool.name}`}
              value={!disabledTools.has(tool.name)}
            />
          ))}
        </Section>
      )}
    </View>
  );
}
