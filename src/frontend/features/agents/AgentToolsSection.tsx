import MonitorCloudIcon from '@cherrystudio/app-icons/icons/monitor-cloud';
import RotateCcwIcon from '@cherrystudio/app-icons/icons/rotate-ccw';
import TrashIcon from '@cherrystudio/app-icons/icons/trash-2';
import WrenchIcon from '@cherrystudio/app-icons/icons/wrench';
import { Button, Section, Switch } from '@cherrystudio/ui/components';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { queryKeys, useBackendModule } from '@/frontend/data';
import type { WriteAgentToolBinding } from '@/shared/data/api/schemas/agentToolBindings';
import type { AgentToolBinding } from '@/shared/data/types/agentToolBinding';
import type { McpServer } from '@/shared/data/types/mcpServer';

import {
  type AgentMcpServerOptionStatus,
  type AgentMcpToolBindingStatus,
  buildAgentMcpServerOptions,
  getAgentMcpToolBindingStatus,
  isStreamableHttpServer,
  type McpToolBindingDraft,
  type McpToolCatalog,
  removeAgentToolBinding,
  setAgentMcpServerEnabled,
} from './agentToolSettings';

type AgentToolsSectionProps = {
  bindings: readonly WriteAgentToolBinding[];
  onChange: (bindings: WriteAgentToolBinding[]) => void;
  originalBindings: readonly AgentToolBinding[];
  servers: readonly McpServer[];
};

export function AgentToolsSection({
  bindings,
  onChange,
  originalBindings,
  servers,
}: AgentToolsSectionProps) {
  const { t } = useTranslation();
  const mcp = useBackendModule('mcp');
  const serverOptions = useMemo(
    () => buildAgentMcpServerOptions({ bindings, originalBindings, servers }),
    [bindings, originalBindings, servers],
  );
  const perToolBindings = useMemo(
    () =>
      bindings.filter(
        (binding): binding is McpToolBindingDraft =>
          binding.source === 'mcp' && binding.rawToolName !== undefined,
      ),
    [bindings],
  );
  const serversById = useMemo(
    () => new Map(servers.map((server) => [server.id, server])),
    [servers],
  );
  const catalogServerIds = useMemo(
    () => [
      ...new Set(
        perToolBindings.flatMap((binding) => {
          const server = serversById.get(binding.serverId);
          return server?.isEnabled && isStreamableHttpServer(server) ? [server.id] : [];
        }),
      ),
    ],
    [perToolBindings, serversById],
  );
  const catalogQueryOptions = useMemo(
    () =>
      catalogServerIds.map((serverId) => ({
        queryFn: () => mcp.listTools(serverId),
        queryKey: queryKeys.mcpServers.tools(serverId),
        retry: false,
      })),
    [catalogServerIds, mcp],
  );
  const catalogQueries = useQueries({ queries: catalogQueryOptions });
  const catalogs = new Map<string, McpToolCatalog>(
    catalogServerIds.map((serverId, index) => {
      const query = catalogQueries[index];
      const catalog: McpToolCatalog = query?.isError
        ? { state: 'error' }
        : query?.isPending
          ? { state: 'loading' }
          : {
              names: new Set(query?.data?.map((tool) => tool.name) ?? []),
              state: 'ready',
            };
      return [serverId, catalog] as const;
    }),
  );

  return (
    <View className="gap-6">
      <View className="gap-2">
        <Text className="px-1 font-medium text-muted-foreground text-sm">
          {t('agent.tools.section')}
        </Text>
        <View className="gap-2">
          {serverOptions.map((option) => {
            const canEnable =
              option.server !== undefined &&
              option.server.isEnabled &&
              isStreamableHttpServer(option.server);
            const isEnabled = option.binding?.enabled === true;
            const isStored = option.binding !== undefined;
            const displayName = option.displayName || t('agent.tools.server');
            const accessibilityLabel = t('agent.tools.serverAccessibilityLabel', {
              id: option.serverId,
              server: displayName,
              status: t(`agent.tools.serverStatus.${option.status}`),
            });

            return (
              <Section key={option.serverId}>
                <Section.Item
                  className="py-2"
                  description={statusCaption(t, 'agent.tools.serverStatus', option.status)}
                  label={displayName}
                  leading={<MonitorCloudIcon className="size-5 text-foreground" />}
                  trailing={
                    <View className="flex-row items-center gap-1">
                      {canEnable ? (
                        <Switch
                          accessibilityLabel={accessibilityLabel}
                          onValueChange={(enabled) =>
                            onChange(setAgentMcpServerEnabled(bindings, option, enabled))
                          }
                          value={isEnabled}
                        />
                      ) : null}
                      {isStored && (!canEnable || !isEnabled) ? (
                        <Button
                          accessibilityLabel={t('agent.tools.removeAccessibilityLabel', {
                            id: option.serverId,
                            server: displayName,
                          })}
                          icon={<TrashIcon />}
                          onPress={() =>
                            onChange(setAgentMcpServerEnabled(bindings, option, false))
                          }
                          size="xs"
                          variant="ghost"
                        />
                      ) : !isStored && option.originalBinding && !canEnable ? (
                        <Button
                          accessibilityLabel={t('agent.tools.restoreAccessibilityLabel', {
                            id: option.serverId,
                            server: displayName,
                          })}
                          icon={<RotateCcwIcon />}
                          onPress={() => onChange(setAgentMcpServerEnabled(bindings, option, true))}
                          size="xs"
                          variant="ghost"
                        />
                      ) : null}
                    </View>
                  }
                />
              </Section>
            );
          })}
        </View>
      </View>
      {perToolBindings.length > 0 ? (
        <View className="gap-2">
          <Text className="px-1 font-medium text-muted-foreground text-sm">
            {t('agent.tools.existingToolRules')}
          </Text>
          <View className="gap-2">
            {perToolBindings.map((binding) => {
              const server = serversById.get(binding.serverId);
              const status = getAgentMcpToolBindingStatus({
                binding,
                catalog: catalogs.get(binding.serverId),
                server,
              });
              const displayName =
                server?.name ?? binding.displayNameSnapshot ?? t('agent.tools.server');

              return (
                <Section key={toolBindingKey(binding)}>
                  <Section.Item
                    className="py-2"
                    description={statusCaption(t, 'agent.tools.toolStatus', status)}
                    label={`${displayName} · ${binding.rawToolName}`}
                    leading={<WrenchIcon className="size-5 text-foreground" />}
                    trailing={
                      <Button
                        accessibilityLabel={t('agent.tools.toolAccessibilityLabel', {
                          id: binding.serverId,
                          server: displayName,
                          status: t(`agent.tools.toolStatus.${status}`),
                          tool: binding.rawToolName,
                        })}
                        icon={<TrashIcon />}
                        onPress={() => onChange(removeAgentToolBinding(bindings, binding))}
                        size="xs"
                        variant="ghost"
                      />
                    }
                  />
                </Section>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The switch already expresses healthy and merely-disabled states, and a
 * loading catalog resolves on its own; only a problem the row cannot express
 * otherwise earns a caption.
 */
const QUIET_STATUSES: ReadonlySet<AgentMcpServerOptionStatus | AgentMcpToolBindingStatus> = new Set(
  ['available', 'binding-disabled', 'catalog-loading', 'enabled'],
);

function statusCaption(
  t: (key: string) => string,
  translationPrefix: 'agent.tools.serverStatus' | 'agent.tools.toolStatus',
  status: AgentMcpServerOptionStatus | AgentMcpToolBindingStatus,
) {
  if (QUIET_STATUSES.has(status)) {
    return undefined;
  }
  return (
    <Text className="text-destructive text-sm" selectable>
      {t(`${translationPrefix}.${status}`)}
    </Text>
  );
}

function toolBindingKey(binding: McpToolBindingDraft): string {
  return JSON.stringify([binding.serverId, binding.rawToolName]);
}
