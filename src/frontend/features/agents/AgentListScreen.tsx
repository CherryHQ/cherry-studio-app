import BotIcon from '@cherrystudio/app-icons/icons/bot';
import CheckIcon from '@cherrystudio/app-icons/icons/check';
import ClockIcon from '@cherrystudio/app-icons/icons/clock';
import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import {
  ContentState,
  ContextMenu,
  ContextMenuScrollBoundary,
  type MenuItem,
  useAlert,
} from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type AccessibilityActionEvent, ScrollView, Text, View } from 'react-native';
import { Pressable as GesturePressable } from 'react-native-gesture-handler';
import Animated, { FadeInLeft, FadeOutLeft } from 'react-native-reanimated';

import { AgentAvatar } from '@/frontend/components/avatar';
import { RouteHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
import { InlineSearch, useInlineSearch } from '@/frontend/components/inlineSearch';
import { useOpenAgentChat } from '@/frontend/components/navigation/chat';
import {
  areAllSelected,
  SelectionToolbar,
  toggleSelection,
  useListBottomInset,
} from '@/frontend/components/selection';
import { useAgentMutations, useAgentsApi } from '@/frontend/hooks/agent';
import type { Agent } from '@/shared/data/types/agent';

const EDITING_ACCESSIBILITY_ACTIONS = [{ name: 'activate' }] as const;

export default function AgentListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { agents, error, isLoading, refetch } = useAgentsApi();
  const openAgentChat = useOpenAgentChat();
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
  const {
    isFiltering,
    query,
    results: listedAgents,
    setQuery,
  } = useInlineSearch({
    fields: (agent: Agent) => [agent.name, agent.modelName],
    items: visibleAgents,
  });

  const enterEditing = useCallback(() => {
    if (isBatchDeleting) {
      return;
    }

    // Selection acts on the whole list, and the search field is hidden while
    // editing, so an active query would silently narrow what "select all"
    // covers with nothing on screen to explain why.
    setQuery('');
    setIsEditing(true);
  }, [isBatchDeleting, setQuery]);
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
  const openSessionList = useCallback(() => {
    router.push('/sessions');
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
  // Leading the overflow menu, so the two read as "history, then everything
  // else" rather than burying the session list inside the menu.
  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('agent.actions.viewSessions'),
        icon: ClockIcon,
        key: 'view-sessions',
        onPress: openSessionList,
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
    [menuItems, openSessionList, t],
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
      {/* Unmounting is what clears the field: iOS holds the text natively and
          only reports it back, so leaving it mounted would keep a stale query
          filtering rows that selection mode has no way to show. */}
      {isEditing ? null : <InlineSearch onChangeText={setQuery} value={query} />}
      <ContextMenuScrollBoundary>
        {(scrollHandlers) => (
          <ScrollView
            {...scrollHandlers}
            alwaysBounceVertical={false}
            className="flex-1"
            contentContainerStyle={scrollContentStyle}
            contentInsetAdjustmentBehavior="automatic"
            showsVerticalScrollIndicator={false}
          >
            {listedAgents.length > 0 ? (
              <View>
                {listedAgents.map((agent) => (
                  <AgentListRow
                    key={agent.id}
                    agent={agent}
                    isEditing={isEditing}
                    isSelected={selectedIds.has(agent.id)}
                    onDelete={requestDeleteAgent}
                    onEdit={openAgentEditor}
                    onOpen={openAgentChat}
                    onToggle={toggleAgent}
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

type AgentListRowProps = {
  agent: Agent;
  isEditing: boolean;
  isSelected: boolean;
  onDelete: (agent: Agent) => void;
  onEdit: (agentId: string) => void;
  onOpen: (agentId: string) => Promise<void>;
  onToggle: (agentId: string) => void;
};

function AgentListRow({
  agent,
  isEditing,
  isSelected,
  onDelete,
  onEdit,
  onOpen,
  onToggle,
}: AgentListRowProps) {
  const { t } = useTranslation();

  const handleEditPress = useCallback(() => {
    onEdit(agent.id);
  }, [agent.id, onEdit]);
  const handleDeletePress = useCallback(() => {
    onDelete(agent);
  }, [agent, onDelete]);
  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === 'activate') {
        onToggle(agent.id);
      }
    },
    [agent.id, onToggle],
  );
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

  const row = (
    <GesturePressable
      accessibilityActions={isEditing ? EDITING_ACCESSIBILITY_ACTIONS : undefined}
      accessibilityLabel={agent.name}
      accessibilityRole={isEditing ? 'checkbox' : 'link'}
      accessibilityState={isEditing ? { checked: isSelected } : undefined}
      className="w-full active:bg-secondary"
      onAccessibilityAction={isEditing ? handleAccessibilityAction : undefined}
      onPress={isEditing ? () => onToggle(agent.id) : () => void onOpen(agent.id)}
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
  );

  return isEditing ? row : <ContextMenu items={menuItems}>{row}</ContextMenu>;
}
