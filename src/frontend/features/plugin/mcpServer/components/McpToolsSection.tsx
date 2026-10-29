import { ContentState, Section, useIsInLockedGroup } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { withPolicy } from '@/frontend/components/Policy';
import type { McpServer } from '@/shared/data/types/mcpServer';

import { useMcpServerTools } from '../hooks/useMcpServerTools';

/**
 * The tools a server exposes, each with the switch that keeps it out of the model's toolset. Only
 * availability is configurable; whether a call may run is fixed application policy (every MCP tool
 * asks before executing). Rows stay one line of name and one of description so a server with many
 * tools still reads as a compact list. Inside a locked group the switches render locked.
 */
function ToolsSection({
  explainsFailure = false,
  isDisabled = false,
  onToggleTool,
  server,
}: {
  /** Replaces the transport's raw error with what the user can do; an organization's server. */
  explainsFailure?: boolean;
  isDisabled?: boolean;
  onToggleTool: (toolName: string, enabled: boolean) => void;
  server: McpServer;
}) {
  const { t } = useTranslation();
  const nested = useIsInLockedGroup();
  const toolsQuery = useMcpServerTools(server);
  const tools = toolsQuery.data ?? [];
  const disabledTools = useMemo(() => new Set(server.disabledTools), [server.disabledTools]);
  const enabledCount = tools.filter((tool) => !disabledTools.has(tool.name)).length;

  return (
    <View className={nested ? 'gap-1 pt-3' : 'gap-3'}>
      <View className={cn('flex-row items-baseline justify-between gap-3', nested && 'px-4')}>
        <Text
          accessibilityRole="header"
          className={
            nested
              ? 'text-sm font-medium text-foreground-tertiary'
              : 'text-base font-semibold text-foreground'
          }
        >
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
        <View className={nested ? 'px-4 py-3' : undefined}>
          <ContentState.Loading layout="row" title={t('settings.mcp.tools.loading')} />
        </View>
      ) : toolsQuery.isError ? (
        <View className={nested ? 'px-4 py-3' : undefined}>
          <ContentState.Error
            // For a user's own server the reason is the whole point: an expired token and a typo'd
            // URL are the same generic failure without it. An organization's server is not theirs
            // to fix, so they get the next step instead.
            description={
              explainsFailure
                ? t('enterprise.managed.mcpUnreachable.description')
                : toolsQuery.error instanceof Error
                  ? toolsQuery.error.message
                  : String(toolsQuery.error)
            }
            layout="leading"
            primaryAction={{
              children: t('settings.mcp.tools.retry'),
              onPress: () => void toolsQuery.refetch(),
            }}
            title={
              explainsFailure
                ? t('enterprise.managed.mcpUnreachable.title')
                : t('settings.mcp.tools.loadFailed')
            }
          />
        </View>
      ) : tools.length === 0 ? (
        <View className={nested ? 'px-4 py-3' : undefined}>
          <ContentState.Empty layout="leading" title={t('settings.mcp.tools.empty')} />
        </View>
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

export const McpToolsSection = withPolicy(ToolsSection, (policy) => ({
  explainsFailure: policy.managed,
}));
