import { useQuery } from '@tanstack/react-query';
import { Spinner } from 'heroui-native/spinner';
import { Switch } from 'heroui-native/switch';
import { useToast } from 'heroui-native/toast';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { queryKeys, useBackendModule } from '@/frontend/data';
import {
  hasMcpServerWildcardRule,
  matchesMcpSourceToolRule,
} from '@cherrystudio/shared/ai/tools/mcpSourcePolicy';
import type { StreamableHttpMcpServer } from '@cherrystudio/shared/data/types/mcpServer';
import { SettingsDialogActionButton } from '../../components/SettingsDialogActionButton';

type McpToolsSectionProps = {
  isReadOnly?: boolean;
  /** `knownToolNames` lets the writer re-expand rules wider than one tool. */
  onToggleAutoApprove: (
    toolName: string,
    autoApprove: boolean,
    knownToolNames: string[],
  ) => Promise<void>;
  onToggleTool: (toolName: string, enabled: boolean, knownToolNames: string[]) => Promise<void>;
  server: StreamableHttpMcpServer;
};

export function McpToolsSection({
  isReadOnly = false,
  onToggleAutoApprove,
  onToggleTool,
  server,
}: McpToolsSectionProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const mcp = useBackendModule('mcp');
  const isToggleInFlight = useRef(false);
  const [isTogglePending, setIsTogglePending] = useState(false);
  // Matches raw names, wire ids and server wildcards alike, so a tool disabled
  // by any rule form reads as off here.
  const isDisabled = (toolName: string) =>
    server.disabledTools.some((value) =>
      matchesMcpSourceToolRule(value, server, { name: toolName }),
    );
  // Listed = needs manual approval; an empty list means everything runs
  // without asking (auto-approve is the default, prompting is opt-in).
  const isAutoApproved = (toolName: string) =>
    !server.disabledAutoApproveTools.some((value) =>
      matchesMcpSourceToolRule(value, server, { name: toolName }),
    );

  const toolsQuery = useQuery({
    enabled: /^https?:\/\//i.test(server.baseUrl),
    queryFn: () => mcp.listTools(server.id),
    queryKey: queryKeys.mcpServers.tools(server.id),
    retry: false,
  });

  const refetch = useCallback(() => {
    void toolsQuery.refetch();
  }, [toolsQuery]);

  /**
   * Clearing a server-wide rule rewrites it as one explicit entry per tool it
   * still has to cover, so the list it expands against must be complete — a
   * tool missing from a stale render would silently lose its rule. Every other
   * rule form covers one tool, and needs no round trip.
   */
  const resolveKnownToolNames = useCallback(
    async (rules: readonly string[], toolName: string): Promise<string[] | undefined> => {
      if (!hasMcpServerWildcardRule(rules, server)) {
        return [toolName];
      }

      const fresh = await toolsQuery.refetch();
      if (fresh.isError || !fresh.data) {
        toast.show({ label: t('settings.mcp.tools.refreshFailed'), variant: 'danger' });
        return undefined;
      }

      return fresh.data.map((tool) => tool.name);
    },
    [server, t, toast, toolsQuery],
  );

  const runToggle = useCallback(async (toggle: () => Promise<void>) => {
    if (isToggleInFlight.current) {
      return;
    }

    isToggleInFlight.current = true;
    setIsTogglePending(true);
    try {
      await toggle();
    } finally {
      isToggleInFlight.current = false;
      setIsTogglePending(false);
    }
  }, []);

  const handleToggleTool = useCallback(
    async (toolName: string, enabled: boolean) => {
      await runToggle(async () => {
        const knownToolNames = enabled
          ? await resolveKnownToolNames(server.disabledTools, toolName)
          : [];
        if (knownToolNames) {
          await onToggleTool(toolName, enabled, knownToolNames);
        }
      });
    },
    [onToggleTool, resolveKnownToolNames, runToggle, server.disabledTools],
  );

  const handleToggleAutoApprove = useCallback(
    async (toolName: string, autoApprove: boolean) => {
      await runToggle(async () => {
        const knownToolNames = autoApprove
          ? await resolveKnownToolNames(server.disabledAutoApproveTools, toolName)
          : [];
        if (knownToolNames) {
          await onToggleAutoApprove(toolName, autoApprove, knownToolNames);
        }
      });
    },
    [onToggleAutoApprove, resolveKnownToolNames, runToggle, server.disabledAutoApproveTools],
  );

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
        {/* The reason is the whole point here — an expired token and a typo'd
            URL are the same generic failure without it. */}
        <Text className="text-default-foreground text-xs" selectable>
          {toolsQuery.error instanceof Error ? toolsQuery.error.message : String(toolsQuery.error)}
        </Text>
        <SettingsDialogActionButton label={t('settings.mcp.tools.retry')} onPress={refetch} />
      </View>
    );
  }

  const tools = toolsQuery.data ?? [];
  const controlsAreReadOnly = isReadOnly || isTogglePending;

  if (tools.length === 0) {
    return <Text className="text-default-foreground text-sm">{t('settings.mcp.tools.empty')}</Text>;
  }

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-end gap-4">
        <Text className="w-14 text-center text-default-foreground text-[10px]" numberOfLines={1}>
          {t('settings.mcp.tools.enabledColumn')}
        </Text>
        <Text className="w-14 text-center text-default-foreground text-[10px]" numberOfLines={2}>
          {t('settings.mcp.tools.autoApproveColumn')}
        </Text>
      </View>
      {tools.map((tool) => {
        const toolDisabled = isDisabled(tool.name);

        return (
          <View className="flex-row items-center gap-4" key={tool.name}>
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
            <View className="w-14 items-center">
              <Switch
                accessibilityLabel={t('settings.mcp.tools.enabledAccessibilityLabel', {
                  tool: tool.name,
                })}
                isDisabled={controlsAreReadOnly}
                isSelected={!toolDisabled}
                onSelectedChange={(enabled) => void handleToggleTool(tool.name, enabled)}
              />
            </View>
            <View className="w-14 items-center">
              <Switch
                accessibilityLabel={t('settings.mcp.tools.autoApproveAccessibilityLabel', {
                  tool: tool.name,
                })}
                isDisabled={controlsAreReadOnly || toolDisabled}
                isSelected={isAutoApproved(tool.name)}
                onSelectedChange={(autoApprove) =>
                  void handleToggleAutoApprove(tool.name, autoApprove)
                }
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}
