import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import SparkPenIcon from '@cherrystudio/app-icons/icons/spark-pen';
import {
  ContentState,
  type MenuItem,
  ScrollInteractionBoundary,
  SelectionIndicator,
  Sortable,
  useAlert,
  useSortableScrollController,
  useToast,
} from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from '@legendapp/list/react-native';
import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type AccessibilityProps,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewProps,
} from 'react-native';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/appShell/header';
import { chatRouteParams } from '@/frontend/appShell/navigation/chat';
import { AgentAvatar } from '@/frontend/components/Avatar';
import { InlineSearch, useInlineSearch } from '@/frontend/components/InlineSearch';
import {
  ManagedMark,
  useManagedLabel,
  withPolicy,
  withResourcePolicy,
} from '@/frontend/components/Policy';
import {
  SelectionControls,
  SelectionProvider,
  type SelectionSource,
  useListBottomInset,
  usePendingDeletionIds,
  useRegisterSelectionSource,
  useSelectionActions,
  useSelectionState,
} from '@/frontend/components/Selection';
import { useReorder } from '@/frontend/data';
import { dataApiCollectionFilters } from '@/frontend/data/utils/optimisticQueryUpdate';
import { reorderLocally } from '@/frontend/data/utils/reorder';
import { useAgentMutations, useAgentsApi } from '@/frontend/hooks/agent';
import { agentPolicy } from '@/shared/data/managedPolicy';
import type { Agent } from '@/shared/data/types/agent';

const agentSelectionScope = 'agents';
// A 40pt avatar, its 12pt vertical padding, and the hairline separator.
const AGENT_ROW_ESTIMATED_HEIGHT = 65;

type AgentListExtraData = {
  canReorder: boolean;
  groupSize: number;
  isDeletionPending: boolean;
  isEditing: boolean;
  lastId: string | undefined;
  onDelete: (agent: Agent) => void;
  onEdit: (agentId: string) => void;
  onMoveToTop: (index: number) => void;
  onOpenChat: (agentId: string) => void;
  onStartSelection: (agentId: string) => void;
  onToggle: (agentId: string) => void;
  selectedIds: ReadonlySet<string>;
};

function AgentListScreenBody() {
  const { t } = useTranslation();
  const router = useRouter();
  const { alert } = useAlert();
  const { toast } = useToast();
  const scroll = useSortableScrollController<LegendListRef>();
  const { agents, error, isLoading, refetch } = useAgentsApi();
  const { deleteAgents } = useAgentMutations();
  const { enterEditing, exitEditing, toggleId } = useSelectionActions();
  const { isDeletionPending, isEditing, selectedIds } = useSelectionState();
  const pendingDeletionIds = usePendingDeletionIds(agentSelectionScope);
  const bottomInset = useListBottomInset();
  const listContentStyle = useMemo(
    () => ({ paddingBottom: bottomInset, paddingHorizontal: 16, paddingTop: 8 }),
    [bottomInset],
  );
  const visibleAgents = useMemo(
    () => agents.filter((agent) => !pendingDeletionIds.has(agent.id)),
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
  const { reorder: reorderAgents } = useReorder<Agent>({
    getId: (agent) => agent.id,
    onError: () => toast.show({ label: t('common.reorderFailed'), variant: 'danger' }),
    queryFilters: [dataApiCollectionFilters('/agents')],
    resource: '/agents',
  });
  const canReorderAgents =
    !isEditing && !isFiltering && !isDeletionPending && listedAgents.length > 1;
  const agentIds = useMemo(() => listedAgents.map((agent) => agent.id), [listedAgents]);

  const handleReorderAgent = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (!canReorderAgents) return;
      void reorderAgents(listedAgents, reorderLocally(listedAgents, fromIndex, toIndex));
    },
    [canReorderAgents, listedAgents, reorderAgents],
  );

  const handleMoveToTop = useCallback(
    (fromIndex: number) => {
      handleReorderAgent(fromIndex, 0);
    },
    [handleReorderAgent],
  );

  const selectionSource = useMemo<SelectionSource>(
    () => ({
      copy: {
        deleteFailed: 'agent.selection.deleteFailed',
        deleteMessage: 'agent.selection.deleteMessage',
        deleteTitle: 'agent.selection.deleteTitle',
      },
      deleteSelected: async (ids) => {
        await deleteAgents(ids);
      },
      // Selection deletes, so it skips Agents the user cannot delete.
      getAllIds: () =>
        listedAgents.flatMap((agent) => (agentPolicy(agent).canDelete ? [agent.id] : [])),
    }),
    [deleteAgents, listedAgents],
  );
  useRegisterSelectionSource(agentSelectionScope, selectionSource);

  const handleStartSelection = useCallback(
    (agentId: string) => {
      if (isEditing || isDeletionPending) {
        return;
      }
      enterEditing();
      toggleId(agentId);
    },
    [enterEditing, isDeletionPending, isEditing, toggleId],
  );

  const handleDeleteAgent = useCallback(
    (agent: Agent) => {
      if (isEditing || isDeletionPending || !agentPolicy(agent).canDelete) {
        return;
      }
      alert.confirm({
        confirmLabel: t('common.delete'),
        description: t('agent.delete.message', { name: agent.name }),
        onConfirm: () => {
          void deleteAgents([agent.id]).catch(() => {
            toast.show({ label: t('agent.toast.deleteFailed'), variant: 'danger' });
          });
        },
        role: 'destructive',
        title: t('agent.delete.title'),
      });
    },
    [alert, deleteAgents, isDeletionPending, isEditing, t, toast],
  );

  const openCreateAgent = useCallback(() => {
    router.push('/agents/new');
  }, [router]);
  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('agent.actions.create'),
        icon: PlusIcon,
        key: 'create-agent',
        nativeIcon: require('@/assets/header-toolbar/plus.png'),
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
  const openAgentChat = useCallback(
    (agentId: string) => {
      router.navigate({
        pathname: '/',
        params: chatRouteParams({ agentId, kind: 'draft' }),
      });
    },
    [router],
  );
  const listExtraData = useMemo<AgentListExtraData>(
    () => ({
      canReorder: canReorderAgents,
      groupSize: listedAgents.length,
      isDeletionPending,
      isEditing,
      lastId: listedAgents.at(-1)?.id,
      onDelete: handleDeleteAgent,
      onEdit: openAgentEditor,
      onMoveToTop: handleMoveToTop,
      onOpenChat: openAgentChat,
      onStartSelection: handleStartSelection,
      onToggle: toggleId,
      selectedIds,
    }),
    [
      canReorderAgents,
      handleDeleteAgent,
      handleMoveToTop,
      handleStartSelection,
      isDeletionPending,
      isEditing,
      listedAgents,
      openAgentChat,
      openAgentEditor,
      selectedIds,
      toggleId,
    ],
  );
  const renderAgentItem = useCallback(
    ({ extraData, index, item }: LegendListRenderItemProps<Agent>) => (
      <AgentSortableListItem
        extraData={extraData as AgentListExtraData}
        index={index}
        item={item}
      />
    ),
    [],
  );
  const listEmpty = isFiltering ? (
    <View className="px-8 py-16">
      <ContentState.Empty title={t('agent.list.noResults')} />
    </View>
  ) : isLoading ? (
    <View className="px-8 py-16">
      <ContentState.Loading title={t('agent.list.loading')} />
    </View>
  ) : error ? (
    <View className="px-8 py-16">
      <ContentState.Error
        primaryAction={{
          children: t('agent.actions.retry'),
          onPress: () => void refetch(),
        }}
        title={t('agent.list.loadFailed')}
      />
    </View>
  ) : (
    <View className="px-8 py-16">
      <ContentState.Empty
        description={t('agent.list.emptyDescription')}
        primaryAction={{
          accessibilityLabel: t('agent.actions.create'),
          children: t('agent.actions.create'),
          onPress: openCreateAgent,
        }}
        prominence="prominent"
        title={t('agent.list.emptyTitle')}
      />
    </View>
  );

  return (
    <>
      <RouteHeader
        rightActions={rightActions}
        selection={isEditing ? { onExit: exitEditing, selectedCount: selectedIds.size } : undefined}
        title={t('agent.list.title')}
      />
      <View className="flex-1">
        {isEditing ? null : (
          <View className="mx-auto w-full max-w-[720px]">
            <InlineSearch onChangeText={setQuery} value={query} />
          </View>
        )}
        <Sortable.Root scrollController={scroll.controller} testID="agent-list-sortable">
          {({ isDragging }) => (
            <ScrollInteractionBoundary>
              {(scrollHandlers) => (
                <>
                  {canReorderAgents ? (
                    <Sortable.Group
                      estimatedItemHeight={AGENT_ROW_ESTIMATED_HEIGHT}
                      groupId="agents"
                      itemIds={agentIds}
                      onReorder={({ fromIndex, toIndex }) => handleReorderAgent(fromIndex, toIndex)}
                    />
                  ) : null}
                  <LegendList
                    {...scrollHandlers}
                    alwaysBounceVertical={false}
                    contentContainerStyle={listContentStyle}
                    contentInsetAdjustmentBehavior="automatic"
                    data={listedAgents}
                    estimatedItemSize={AGENT_ROW_ESTIMATED_HEIGHT}
                    extraData={listExtraData}
                    keyExtractor={agentKeyExtractor}
                    ListEmptyComponent={listEmpty}
                    maintainVisibleContentPosition={false}
                    onScroll={scroll.onScroll}
                    recycleItems
                    ref={scroll.setRef}
                    renderItem={renderAgentItem}
                    scrollEnabled={!isDragging}
                    showsVerticalScrollIndicator={false}
                    style={styles.list}
                  />
                </>
              )}
            </ScrollInteractionBoundary>
          )}
        </Sortable.Root>
        <SelectionControls scope={agentSelectionScope} />
      </View>
    </>
  );
}

export default function AgentListScreen() {
  return (
    <SelectionProvider>
      <AgentListScreenBody />
    </SelectionProvider>
  );
}

function agentKeyExtractor(agent: Agent) {
  return agent.id;
}

const AgentSortableListItem = withResourcePolicy(
  withPolicy(
    function AgentSortableListItemView({
      extraData,
      index,
      isSelectable = true,
      item,
    }: {
      extraData: AgentListExtraData;
      index: number;
      isSelectable?: boolean;
      item: Agent;
    }) {
      const { t } = useTranslation();
      const {
        canReorder,
        groupSize,
        isDeletionPending,
        isEditing,
        lastId,
        onDelete,
        onEdit,
        onMoveToTop,
        onOpenChat,
        onStartSelection,
        onToggle,
        selectedIds,
      } = extraData;
      const isFirst = index === 0;
      const isSelected = selectedIds.has(item.id);
      const canMove = canReorder && groupSize > 1;
      const menuItems: MenuItem[] =
        isEditing || isDeletionPending
          ? []
          : [
              {
                id: 'edit',
                label: t('agent.edit.title'),
                onPress: () => onEdit(item.id),
              },
              ...(canMove && index > 0
                ? [
                    {
                      id: 'move-to-top',
                      label: t('common.moveToTop'),
                      onPress: () => onMoveToTop(index),
                    },
                  ]
                : []),
              ...(isSelectable
                ? [
                    {
                      id: 'select',
                      label: t('agent.selection.start'),
                      onPress: () => onStartSelection(item.id),
                    },
                    {
                      destructive: true,
                      id: 'delete',
                      label: t('common.delete'),
                      onPress: () => onDelete(item),
                    },
                  ]
                : []),
            ];

      return (
        <View className="mx-auto w-full max-w-[720px]">
          <Sortable.Item
            accessibilityLabels={{
              moveDown: t('common.moveDown', { name: item.name }),
              moveToTop: t('common.moveToTop'),
              moveUp: t('common.moveUp', { name: item.name }),
            }}
            disabled={isEditing || isDeletionPending}
            estimatedHeight={AGENT_ROW_ESTIMATED_HEIGHT}
            groupId="agents"
            groupSize={groupSize}
            id={item.id}
            index={index}
            menuItems={menuItems}
            movable={canMove}
            renderOverlay={() => (
              <AgentListRow
                agent={item}
                isEditing={false}
                isSelected={false}
                onEdit={onEdit}
                onOpenChat={onOpenChat}
                onToggle={onToggle}
              />
            )}
          >
            <AgentSortableSlice
              agent={item}
              isEditing={isEditing}
              isFirst={isFirst}
              isLast={item.id === lastId}
              isSelected={isSelected}
              onEdit={onEdit}
              onOpenChat={onOpenChat}
              onToggle={onToggle}
            />
          </Sortable.Item>
        </View>
      );
    },
    (policy) => ({ isSelectable: policy.canDelete }),
  ),
  ({ item }) => agentPolicy(item),
);

function AgentSortableSlice({
  accessibilityActions,
  agent,
  isEditing,
  isFirst,
  isLast,
  isSelected,
  onAccessibilityAction,
  onEdit,
  onOpenChat,
  onToggle,
}: {
  accessibilityActions?: AccessibilityProps['accessibilityActions'];
  agent: Agent;
  isEditing: boolean;
  isFirst: boolean;
  isLast: boolean;
  isSelected: boolean;
  onAccessibilityAction?: ViewProps['onAccessibilityAction'];
  onEdit: (agentId: string) => void;
  onOpenChat: (agentId: string) => void;
  onToggle: (agentId: string) => void;
}) {
  return (
    <View
      className={cn(
        'overflow-hidden bg-card',
        isFirst && 'rounded-t-2xl',
        isLast && 'rounded-b-2xl',
      )}
      style={styles.cardSlice}
    >
      {isFirst ? null : <View className="mx-4 h-px bg-border" />}
      <AgentListRow
        accessibilityActions={accessibilityActions}
        agent={agent}
        isEditing={isEditing}
        isSelected={isSelected}
        onAccessibilityAction={onAccessibilityAction}
        onEdit={onEdit}
        onOpenChat={onOpenChat}
        onToggle={onToggle}
      />
    </View>
  );
}

type AgentListRowProps = {
  accessibilityActions?: AccessibilityProps['accessibilityActions'];
  agent: Agent;
  isEditing: boolean;
  isSelected: boolean;
  /** Selection deletes, so only a deletable Agent joins it. */
  isSelectable?: boolean;
  onAccessibilityAction?: ViewProps['onAccessibilityAction'];
  onEdit: (agentId: string) => void;
  onOpenChat: (agentId: string) => void;
  onToggle: (agentId: string) => void;
};

const AgentListRowView = memo(function AgentListRow({
  accessibilityActions,
  agent,
  isEditing,
  isSelectable = true,
  isSelected,
  onAccessibilityAction,
  onEdit,
  onOpenChat,
  onToggle,
}: AgentListRowProps) {
  const { t } = useTranslation();
  const accessibilityLabel = useManagedLabel(agent.name);

  return (
    <Pressable
      accessibilityActions={isEditing ? undefined : accessibilityActions}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={isEditing ? 'checkbox' : 'button'}
      accessibilityState={isEditing ? { checked: isSelected, disabled: !isSelectable } : undefined}
      className="w-full active:bg-foreground/5"
      disabled={isEditing && !isSelectable}
      onAccessibilityAction={isEditing ? undefined : onAccessibilityAction}
      onPress={() => {
        if (isEditing) {
          onToggle(agent.id);
        } else {
          onOpenChat(agent.id);
        }
      }}
      testID={`agent-list-${agent.id}`}
    >
      <View className="min-w-0 flex-row items-center gap-3 px-4 py-3">
        <AgentAvatar avatar={agent.avatar} name={agent.name} uri={agent.avatarUri} />
        <View className="min-w-0 flex-1 gap-0.5">
          <View className="min-w-0 flex-row items-center gap-2">
            <Text className="shrink text-base text-foreground" numberOfLines={1}>
              {agent.name}
            </Text>
            <ManagedMark />
          </View>
          <Text className="text-muted-foreground text-sm" numberOfLines={1}>
            {agent.modelName ?? t('agent.model.none')}
          </Text>
        </View>
        {isEditing ? (
          <SelectionIndicator locked={!isSelectable} selected={isSelected} />
        ) : (
          <Sortable.Exclusion>
            <Pressable
              accessibilityLabel={t('common.edit')}
              accessibilityRole="button"
              className="h-9 w-9 items-center justify-center rounded-full active:bg-foreground/10"
              hitSlop={8}
              onPress={(event) => {
                event.stopPropagation();
                onEdit(agent.id);
              }}
              testID={`agent-edit-${agent.id}`}
            >
              <SparkPenIcon className="text-muted-foreground" size={20} strokeWidth={1.8} />
            </Pressable>
          </Sortable.Exclusion>
        )}
      </View>
    </Pressable>
  );
});

/** Each row follows its own Agent's policy. */
const AgentListRow = withResourcePolicy(
  withPolicy(AgentListRowView, (policy) => ({ isSelectable: policy.canDelete })),
  ({ agent }) => agentPolicy(agent),
);

const styles = StyleSheet.create({
  cardSlice: { borderCurve: 'continuous' },
  list: { flex: 1 },
});
