import BotIcon from '@cherrystudio/app-icons/icons/bot';
import CheckIcon from '@cherrystudio/app-icons/icons/check';
import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import SearchIcon from '@cherrystudio/app-icons/icons/search';
import { ContentState, type MenuItem, useAlert } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type AccessibilityActionEvent, ScrollView, Text, View } from 'react-native';
import { Pressable as GesturePressable } from 'react-native-gesture-handler';
import Animated, { FadeInLeft, FadeOutLeft } from 'react-native-reanimated';

import { useAppSearch } from '@/frontend/components/appSearch';
import { RouteHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
import { ContextMenuLink, type ContextMenuLinkItem } from '@/frontend/components/navigation';
import {
  areAllSelected,
  SelectionToolbar,
  toggleSelection,
  useListBottomInset,
} from '@/frontend/components/selection';
import { useAgentMutations, useAgentsApi } from '@/frontend/hooks/agent';
import type { Agent } from '@/shared/data/types/agent';

export default function AgentListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { open: openAppSearch } = useAppSearch();
  const { agents, isLoading } = useAgentsApi();
  const { deleteAgent, deleteAgents } = useAgentMutations();
  const { alert } = useAlert();
  const bottomInset = useListBottomInset();
  const [isEditing, setIsEditing] = useState(false);
  const [pendingDeletionIds, setPendingDeletionIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const isBatchDeleting = pendingDeletionIds.size > 0;

  const visibleAgents = useMemo(
    () =>
      pendingDeletionIds.size === 0
        ? agents
        : agents.filter((agent) => !pendingDeletionIds.has(agent.id)),
    [agents, pendingDeletionIds],
  );

  const enterEditing = useCallback(() => {
    if (isBatchDeleting) {
      return;
    }

    setIsEditing(true);
  }, [isBatchDeleting]);
  const exitEditing = useCallback(() => {
    setIsEditing(false);
    setSelectedIds(new Set());
  }, []);
  const toggleAgent = useCallback((agentId: string) => {
    setSelectedIds((current) => toggleSelection(current, agentId));
  }, []);
  const toggleAllAgents = useCallback(() => {
    const agentIds = visibleAgents.map((agent) => agent.id);
    setSelectedIds((current) =>
      areAllSelected(current, agentIds) ? new Set() : new Set(agentIds),
    );
  }, [visibleAgents]);

  const openCreateAgent = useCallback(() => {
    router.push('/agents/new');
  }, [router]);
  const openAgentEditor = useCallback(
    (agentId: string) => {
      router.push({
        pathname: '/agents/[agentId]/edit',
        params: { agentId },
      });
    },
    [router],
  );
  const openAgentSearch = useCallback(() => {
    void openAppSearch<Agent>({
      emptyText: t('agent.list.noResults'),
      getAccessibilityLabel: (agent) => agent.name,
      keyExtractor: (agent) => agent.id,
      placeholder: t('navigation.search'),
      renderItem: (agent) => <AgentSearchResult agent={agent} />,
      search: ({ query }) => {
        const normalizedQuery = query.trim().toLocaleLowerCase();
        const items = normalizedQuery
          ? visibleAgents.filter((agent) =>
              [agent.name, agent.modelName].some((value) =>
                value?.toLocaleLowerCase().includes(normalizedQuery),
              ),
            )
          : visibleAgents;

        return { groups: [{ items, key: 'agents' }] };
      },
    }).then((outcome) => {
      if (outcome.type === 'selected') {
        openAgentEditor(outcome.item.id);
      }
    });
  }, [openAgentEditor, openAppSearch, t, visibleAgents]);
  const menuItems = useMemo<readonly MenuItem[]>(
    () => [
      {
        id: 'create-agent',
        label: t('agent.actions.add'),
        onPress: openCreateAgent,
      },
      {
        disabled: visibleAgents.length === 0 || isBatchDeleting,
        id: 'select-agents',
        label: t('agent.selection.start'),
        onPress: enterEditing,
      },
    ],
    [enterEditing, isBatchDeleting, openCreateAgent, t, visibleAgents.length],
  );
  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('navigation.search'),
        disabled: visibleAgents.length === 0 || isBatchDeleting,
        icon: SearchIcon,
        key: 'search-agents',
        onPress: openAgentSearch,
        type: 'icon',
      },
      {
        accessibilityLabel: t('common.more'),
        icon: EllipsisIcon,
        items: menuItems,
        key: 'agent-actions',
        type: 'menu',
      },
    ],
    [isBatchDeleting, menuItems, openAgentSearch, t, visibleAgents.length],
  );
  const doneActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.done'),
        key: 'finish-selecting-agents',
        label: t('common.done'),
        onPress: exitEditing,
        type: 'label',
      },
    ],
    [exitEditing, t],
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
  const deleteSelectedAgents = useCallback(async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) {
      return;
    }

    setPendingDeletionIds(new Set(ids));
    exitEditing();
    try {
      await deleteAgents(ids);
    } catch {
      alert.show({ title: t('agent.selection.deleteFailed') });
    } finally {
      setPendingDeletionIds(new Set());
    }
  }, [alert, deleteAgents, exitEditing, selectedIds, t]);
  const requestDeleteSelectedAgents = useCallback(() => {
    if (selectedIds.size === 0) {
      return;
    }

    alert.confirm({
      confirmLabel: t('common.delete'),
      description: t('agent.selection.deleteMessage', { count: selectedIds.size }),
      onConfirm: deleteSelectedAgents,
      role: 'destructive',
      title: t('agent.selection.deleteTitle'),
    });
  }, [alert, deleteSelectedAgents, selectedIds.size, t]);
  const scrollContentStyle = useMemo(
    () => ({ paddingBottom: bottomInset, paddingHorizontal: 8 }),
    [bottomInset],
  );

  return (
    <>
      <RouteHeader
        rightActions={isEditing ? doneActions : rightActions}
        title={t('agent.list.title')}
      />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentContainerStyle={scrollContentStyle}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {visibleAgents.length > 0 ? (
          <View>
            {visibleAgents.map((agent) => (
              <AgentListRow
                key={agent.id}
                agent={agent}
                isEditing={isEditing}
                isSelected={selectedIds.has(agent.id)}
                onDelete={requestDeleteAgent}
                onToggle={toggleAgent}
              />
            ))}
          </View>
        ) : isLoading ? (
          <ContentState.Loading className="px-8 py-16" title={t('agent.list.loading')} />
        ) : (
          <ContentState.Empty
            className="px-8 py-16"
            description={t('agent.list.emptyDescription')}
            icon={
              <View className="size-14 items-center justify-center rounded-full bg-secondary">
                <BotIcon className="size-7 text-foreground" />
              </View>
            }
            primaryAction={{
              accessibilityLabel: t('agent.actions.create'),
              children: t('agent.actions.create'),
              className: 'rounded-full',
              onPress: openCreateAgent,
              size: 'default',
            }}
            title={t('agent.list.emptyTitle')}
          />
        )}
      </ScrollView>
      {isEditing ? (
        <SelectionToolbar
          isDeleting={isBatchDeleting}
          onDelete={requestDeleteSelectedAgents}
          onToggleAll={toggleAllAgents}
          selectedCount={selectedIds.size}
        />
      ) : null}
    </>
  );
}

/**
 * Agent avatars are file references owned by the future avatar workflow; every
 * row today has `avatar: null`, which renders as the default badge.
 */
function AgentAvatarBadge({ className }: { className: string }) {
  return (
    <View className={`items-center justify-center rounded-full bg-secondary ${className}`}>
      <BotIcon className="size-5 text-foreground" />
    </View>
  );
}

function AgentSearchResult({ agent }: { agent: Agent }) {
  const { t } = useTranslation();

  return (
    <View className="min-h-12 flex-row items-center gap-3">
      <AgentAvatarBadge className="size-10" />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="font-semibold text-base text-foreground" numberOfLines={1}>
          {agent.name}
        </Text>
        <Text className="text-foreground-tertiary text-xs" numberOfLines={1}>
          {agent.modelName ?? t('agent.model.none')}
        </Text>
      </View>
    </View>
  );
}

type AgentListRowProps = {
  agent: Agent;
  isEditing: boolean;
  isSelected: boolean;
  onDelete: (agent: Agent) => void;
  onToggle: (agentId: string) => void;
};

function AgentListRow({ agent, isEditing, isSelected, onDelete, onToggle }: AgentListRowProps) {
  const { t } = useTranslation();

  const handleDeletePress = useCallback(() => {
    onDelete(agent);
  }, [agent, onDelete]);
  const accessibilityActions = useMemo(
    () =>
      isEditing
        ? [{ name: 'activate' as const }]
        : [{ label: t('common.delete'), name: 'delete' as const }],
    [isEditing, t],
  );
  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (isEditing) {
        onToggle(agent.id);
        return;
      }

      if (event.nativeEvent.actionName === 'delete') {
        handleDeletePress();
      }
    },
    [agent.id, handleDeletePress, isEditing, onToggle],
  );
  const href = useMemo(
    () => ({
      pathname: '/agents/[agentId]/edit' as const,
      params: { agentId: agent.id },
    }),
    [agent.id],
  );
  const menuItems = useMemo<readonly ContextMenuLinkItem[]>(
    () => [
      {
        destructive: true,
        id: 'delete',
        label: t('common.delete'),
        onPress: handleDeletePress,
      },
    ],
    [handleDeletePress, t],
  );

  const row = (
    <GesturePressable
      accessibilityActions={accessibilityActions}
      accessibilityLabel={agent.name}
      accessibilityRole={isEditing ? 'checkbox' : 'link'}
      accessibilityState={isEditing ? { checked: isSelected } : undefined}
      className="w-full active:bg-secondary"
      onAccessibilityAction={handleAccessibilityAction}
      onPress={isEditing ? () => onToggle(agent.id) : undefined}
    >
      <View className="relative min-w-0 flex-1 flex-row items-center gap-2 border-border border-b py-2 pl-2">
        {isEditing ? (
          <Animated.View entering={FadeInLeft.duration(160)} exiting={FadeOutLeft.duration(120)}>
            <View
              className={
                isSelected
                  ? 'size-6 items-center justify-center rounded-full bg-foreground'
                  : 'size-6 items-center justify-center rounded-full border-2 border-border-strong'
              }
            >
              {isSelected ? <CheckIcon className="size-4 text-background" /> : null}
            </View>
          </Animated.View>
        ) : null}
        <AgentAvatarBadge className="ml-1 size-10" />
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
  );

  return isEditing ? (
    row
  ) : (
    <ContextMenuLink href={href} items={menuItems} preview={false}>
      {row}
    </ContextMenuLink>
  );
}
