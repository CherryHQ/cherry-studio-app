import RotateCcwIcon from '@cherrystudio/app-icons/icons/rotate-ccw';
import TrashIcon from '@cherrystudio/app-icons/icons/trash-2';
import { Button, Switch } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import { useQueries } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { queryKeys, useBackendModule } from '@/frontend/data';
import type { WriteAgentToolBinding } from '@/shared/data/api/schemas/agentToolBindings';
import type { AgentToolBinding } from '@/shared/data/types/agentToolBinding';
import type { McpServer } from '@/shared/data/types/mcpServer';

import {
  type AgentMcpServerOption,
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
    <View className="gap-4">
      <Text className="text-muted-foreground text-sm" selectable>
        {t('agent.tools.mcpDescription')}
      </Text>
      {serverOptions.length === 0 ? (
        <Text className="py-2 text-muted-foreground text-sm" selectable>
          {t('agent.tools.empty')}
        </Text>
      ) : (
        <View className="gap-4">
          {serverOptions.map((option) => (
            <AgentMcpServerRow
              bindings={bindings}
              key={option.serverId}
              onChange={onChange}
              option={option}
            />
          ))}
        </View>
      )}
      {perToolBindings.length > 0 ? (
        <View className="gap-3 border-border border-t pt-4">
          <Text className="font-medium text-foreground text-sm" selectable>
            {t('agent.tools.existingToolRules')}
          </Text>
          {perToolBindings.map((binding) => {
            const server = serversById.get(binding.serverId);
            const status = getAgentMcpToolBindingStatus({
              binding,
              catalog: catalogs.get(binding.serverId),
              server,
            });
            const displayName =
              server?.name ?? binding.displayNameSnapshot ?? t('agent.tools.server');
            const accessibilityLabel = t('agent.tools.toolAccessibilityLabel', {
              id: binding.serverId,
              server: displayName,
              status: t(`agent.tools.toolStatus.${status}`),
              tool: binding.rawToolName,
            });

            return (
              <View className="min-h-12 flex-row items-center gap-3" key={toolBindingKey(binding)}>
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text className="font-medium text-foreground text-sm" numberOfLines={1}>
                    {displayName} · {binding.rawToolName}
                  </Text>
                  <Text
                    className="font-mono text-foreground-tertiary text-xs"
                    numberOfLines={1}
                    selectable
                  >
                    {binding.serverId}
                  </Text>
                  <StatusText status={status} translationPrefix="agent.tools.toolStatus" />
                </View>
                <Button
                  accessibilityLabel={accessibilityLabel}
                  icon={<TrashIcon />}
                  onPress={() => onChange(removeAgentToolBinding(bindings, binding))}
                  size="xs"
                  variant="ghost"
                />
              </View>
            );
          })}
        </View>
      ) : null}
      <Text className="text-foreground-tertiary text-xs" selectable>
        {t('agent.tools.nextTurn')}
      </Text>
    </View>
  );
}

function AgentMcpServerRow({
  bindings,
  onChange,
  option,
}: {
  bindings: readonly WriteAgentToolBinding[];
  onChange: (bindings: WriteAgentToolBinding[]) => void;
  option: AgentMcpServerOption;
}) {
  const { t } = useTranslation();
  const canEnable =
    option.server !== undefined && option.server.isEnabled && isStreamableHttpServer(option.server);
  const isEnabled = option.binding?.enabled === true;
  const isStored = option.binding !== undefined;
  const displayName = option.displayName || t('agent.tools.server');
  const accessibilityLabel = t('agent.tools.serverAccessibilityLabel', {
    id: option.serverId,
    server: displayName,
    status: t(`agent.tools.serverStatus.${option.status}`),
  });
  const handleRemove = useCallback(
    () => onChange(setAgentMcpServerEnabled(bindings, option, false)),
    [bindings, onChange, option],
  );
  const handleRestore = useCallback(
    () => onChange(setAgentMcpServerEnabled(bindings, option, true)),
    [bindings, onChange, option],
  );
  const handleValueChange = useCallback(
    (enabled: boolean) => onChange(setAgentMcpServerEnabled(bindings, option, enabled)),
    [bindings, onChange, option],
  );

  return (
    <View className="min-h-12 flex-row items-center gap-3">
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="font-medium text-base text-foreground" numberOfLines={1}>
          {displayName}
        </Text>
        <Text className="font-mono text-foreground-tertiary text-xs" numberOfLines={1} selectable>
          {option.serverId}
        </Text>
        <StatusText status={option.status} translationPrefix="agent.tools.serverStatus" />
      </View>
      <View className="shrink-0 flex-row items-center gap-1">
        {canEnable ? (
          <Switch
            accessibilityLabel={accessibilityLabel}
            onValueChange={handleValueChange}
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
            onPress={handleRemove}
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
            onPress={handleRestore}
            size="xs"
            variant="ghost"
          />
        ) : null}
      </View>
    </View>
  );
}

function StatusText({
  status,
  translationPrefix,
}: {
  status: AgentMcpServerOptionStatus | AgentMcpToolBindingStatus;
  translationPrefix: 'agent.tools.serverStatus' | 'agent.tools.toolStatus';
}) {
  const { t } = useTranslation();

  return (
    <Text
      className={cn(
        'text-xs',
        status === 'enabled' || status === 'available'
          ? 'text-success-subtle-foreground'
          : status === 'binding-disabled' || status === 'catalog-loading'
            ? 'text-muted-foreground'
            : 'text-destructive',
      )}
      selectable
    >
      {t(`${translationPrefix}.${status}`)}
    </Text>
  );
}

function toolBindingKey(binding: McpToolBindingDraft): string {
  return JSON.stringify([binding.serverId, binding.rawToolName]);
}
