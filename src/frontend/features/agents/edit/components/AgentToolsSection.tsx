import TrashIcon from '@cherrystudio/app-icons/icons/trash-2';
import { BottomSheet, Button, Section } from '@cherrystudio/ui/components';
import { useQueries } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, ScrollView, Text, View } from 'react-native';

import { queryKeys, useBackendModule } from '@/frontend/data';
import type { WriteAgentToolBinding } from '@/shared/data/api/schemas/agentToolBindings';
import type { AgentToolBinding } from '@/shared/data/types/agentToolBinding';
import type { McpServer } from '@/shared/data/types/mcpServer';

import {
  type AgentMcpServerOptionStatus,
  type AgentMcpToolBindingStatus,
  buildAgentMcpServerOptions,
  getAgentMcpToolBindingStatus,
  isRunnableMcpServer,
  type McpToolBindingDraft,
  type McpToolCatalog,
  removeAgentToolBinding,
  setAgentMcpServerEnabled,
} from '../agentToolSettings';

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
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const mcp = useBackendModule('mcp');
  const serverOptions = useMemo(
    () => buildAgentMcpServerOptions({ bindings, originalBindings, servers }),
    [bindings, originalBindings, servers],
  );
  const perToolBindings = useMemo(
    () =>
      bindings.filter(
        (binding) =>
          binding.enabled &&
          binding.rawToolName !== undefined &&
          !servers.some((server) => server.id === binding.serverId && server.origin === 'builtin'),
      ),
    [bindings, servers],
  );
  const enabledServers = serverOptions.filter((option) => option.binding?.enabled);
  const availableServers = serverOptions.filter(
    (option) =>
      !option.binding?.enabled && option.server?.isEnabled && isRunnableMcpServer(option.server),
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
          return server?.isEnabled && isRunnableMcpServer(server) ? [server.id] : [];
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
      <Section title={enabledServers.length > 0 ? t('agent.tools.section') : undefined}>
        {enabledServers.map((option) => {
          const displayName = option.displayName || t('agent.tools.server');
          const accessibilityLabel = t('agent.tools.serverAccessibilityLabel', {
            id: option.serverId,
            server: displayName,
            status: t(`agent.tools.serverStatus.${option.status}`),
          });

          return (
            <Section.Item
              key={option.serverId}
              description={statusCaption(t, 'agent.tools.serverStatus', option.status)}
              label={displayName}
              accessibilityLabel={accessibilityLabel}
              trailing={
                <Button
                  accessibilityLabel={t('agent.tools.removeAccessibilityLabel', {
                    id: option.serverId,
                    server: displayName,
                  })}
                  icon={<TrashIcon />}
                  onPress={() => onChange(setAgentMcpServerEnabled(bindings, option, false))}
                  size="xs"
                  variant="ghost"
                />
              }
            />
          );
        })}
        <Section.Item
          label={t('agent.tools.add')}
          onPress={() => {
            Keyboard.dismiss();
            setIsAdding(true);
          }}
        />
      </Section>
      {perToolBindings.length > 0 ? (
        <Section title={t('agent.tools.existingToolRules')}>
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
              <Section.Item
                key={toolBindingKey(binding)}
                description={statusCaption(t, 'agent.tools.toolStatus', status)}
                label={`${displayName} · ${binding.rawToolName}`}
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
            );
          })}
        </Section>
      ) : null}
      <BottomSheet
        onClose={() => setIsAdding(false)}
        open={isAdding}
        size="medium"
        title={t('agent.tools.add')}
      >
        <ScrollView contentContainerClassName="pt-2" showsVerticalScrollIndicator={false}>
          <Section variant="plain">
            {availableServers.map((option) => (
              <Section.Item
                key={option.serverId}
                label={option.displayName || t('agent.tools.server')}
                onPress={() => {
                  onChange(setAgentMcpServerEnabled(bindings, option, true));
                  setIsAdding(false);
                }}
                showChevron={false}
              />
            ))}
            <Section.Item
              label={t('agent.tools.manage')}
              onPress={() => {
                setIsAdding(false);
                router.push('/plugins');
              }}
            />
          </Section>
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

/**
 * The editor lists enabled bindings. A loading catalog resolves on its own;
 * only unavailable tools or connections need a caption.
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
    <Text className="text-error text-sm" selectable>
      {t(`${translationPrefix}.${status}`)}
    </Text>
  );
}

function toolBindingKey(binding: McpToolBindingDraft): string {
  return JSON.stringify([binding.serverId, binding.rawToolName]);
}
