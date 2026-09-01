import BotIcon from '@cherrystudio/app-icons/icons/bot';
import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import {
  ContentState,
  ContextMenu,
  ContextMenuScrollBoundary,
  type MenuItem,
  useAlert,
} from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { Pressable as GesturePressable } from 'react-native-gesture-handler';

import { AgentAvatar } from '@/frontend/components/avatar';
import { RouteHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
import { InlineSearch, useInlineSearch } from '@/frontend/components/inlineSearch';
import { useAgentMutations, useAgentsApi } from '@/frontend/hooks/agent';
import type { Agent } from '@/shared/data/types/agent';

const listContentStyle = { paddingHorizontal: 8 } as const;

export default function AgentListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { agents, error, isLoading, refetch } = useAgentsApi();
  const { deleteAgent } = useAgentMutations();
  const { alert } = useAlert();
  const {
    isFiltering,
    query,
    results: listedAgents,
    setQuery,
  } = useInlineSearch({
    fields: (agent: Agent) => [agent.name, agent.modelName],
    items: agents,
  });

  const openCreateAgent = useCallback(() => {
    router.push('/agents/new');
  }, [router]);
  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('agent.actions.create'),
        icon: PlusIcon,
        key: 'create-agent',
        onPress: openCreateAgent,
        type: 'icon',
      },
    ],
    [openCreateAgent, t],
  );
  const openAgentEditor = useCallback(
    (agentId: string) => {
      router.push({
        pathname: '/agents/[agentId]/edit',
        params: { agentId },
      });
    },
    [router],
  );
  const requestDeleteAgent = useCallback(
    (agent: Agent) => {
      alert.confirm({
        confirmLabel: t('common.delete'),
        description: t('agent.delete.message', { name: agent.name }),
        role: 'destructive',
        title: t('agent.delete.title'),
        onConfirm: () => {
          void deleteAgent(agent.id).catch(() => {
            alert.show({ title: t('agent.toast.deleteFailed') });
          });
        },
      });
    },
    [alert, deleteAgent, t],
  );

  return (
    <>
      <RouteHeader rightActions={rightActions} title={t('agent.list.title')} />
      <InlineSearch onChangeText={setQuery} value={query} />
      <ContextMenuScrollBoundary>
        {(scrollHandlers) => (
          <ScrollView
            {...scrollHandlers}
            alwaysBounceVertical={false}
            className="flex-1"
            contentContainerStyle={listContentStyle}
            contentInsetAdjustmentBehavior="automatic"
            showsVerticalScrollIndicator={false}
          >
            {listedAgents.length > 0 ? (
              <View>
                {listedAgents.map((agent) => (
                  <AgentListRow
                    key={agent.id}
                    agent={agent}
                    onDelete={requestDeleteAgent}
                    onEdit={openAgentEditor}
                  />
                ))}
              </View>
            ) : isFiltering ? (
              <ContentState.Empty className="px-8 py-16" title={t('agent.list.noResults')} />
            ) : isLoading ? (
              <ContentState.Loading className="px-8 py-16" title={t('agent.list.loading')} />
            ) : error ? (
              <ContentState.Error
                className="px-8 py-16"
                primaryAction={{
                  children: t('agent.actions.retry'),
                  onPress: () => void refetch(),
                }}
                title={t('agent.list.loadFailed')}
              />
            ) : (
              <ContentState.Empty
                description={t('agent.list.emptyDescription')}
                icon={
                  <ContentState.Icon>
                    <BotIcon className="size-7 text-foreground" />
                  </ContentState.Icon>
                }
                layout="page"
                primaryAction={{
                  accessibilityLabel: t('agent.actions.create'),
                  children: t('agent.actions.create'),
                  onPress: openCreateAgent,
                }}
                title={t('agent.list.emptyTitle')}
              />
            )}
          </ScrollView>
        )}
      </ContextMenuScrollBoundary>
    </>
  );
}

type AgentListRowProps = {
  agent: Agent;
  onDelete: (agent: Agent) => void;
  onEdit: (agentId: string) => void;
};

function AgentListRow({ agent, onDelete, onEdit }: AgentListRowProps) {
  const { t } = useTranslation();

  const handleEditPress = useCallback(() => {
    onEdit(agent.id);
  }, [agent.id, onEdit]);
  const handleDeletePress = useCallback(() => {
    onDelete(agent);
  }, [agent, onDelete]);
  const menuItems = useMemo<readonly MenuItem[]>(
    () => [
      {
        id: 'edit',
        label: t('common.edit'),
        onPress: handleEditPress,
      },
      {
        destructive: true,
        id: 'delete',
        label: t('common.delete'),
        onPress: handleDeletePress,
      },
    ],
    [handleDeletePress, handleEditPress, t],
  );

  return (
    <ContextMenu items={menuItems}>
      <GesturePressable
        accessibilityLabel={agent.name}
        accessibilityRole="link"
        className="w-full active:bg-secondary"
        onPress={handleEditPress}
      >
        <View className="relative min-w-0 flex-1 flex-row items-center gap-2 border-border border-b py-2 pl-2">
          <View className="ml-1">
            <AgentAvatar name={agent.name} uri={agent.avatarUri} />
          </View>
          <View className="min-w-0 flex-1 pr-4">
            <View className="gap-0.5">
              <Text className="font-semibold text-foreground text-base" numberOfLines={1}>
                {agent.name}
              </Text>
              <Text className="text-foreground-tertiary text-xs" numberOfLines={1}>
                {agent.modelName ?? t('agent.model.none')}
              </Text>
            </View>
          </View>
        </View>
      </GesturePressable>
    </ContextMenu>
  );
}
