import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import { ContentState, SelectionIndicator } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/appShell/header';
import { AgentAvatar } from '@/frontend/components/Avatar';
import { InlineSearch, useInlineSearch } from '@/frontend/components/InlineSearch';
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
import { useAgentMutations, useAgentsApi } from '@/frontend/hooks/agent';
import type { Agent } from '@/shared/data/types/agent';

const agentSelectionScope = 'agents';
// A 40pt avatar, its 12pt vertical padding, and the hairline separator.
const AGENT_ROW_ESTIMATED_HEIGHT = 65;

type AgentListExtraData = {
  isEditing: boolean;
  lastId: string | undefined;
  onEdit: (agentId: string) => void;
  onStartSelection: (agentId: string) => void;
  onToggle: (agentId: string) => void;
  selectedIds: ReadonlySet<string>;
};

function AgentListScreenBody() {
  const { t } = useTranslation();
  const router = useRouter();
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
      getAllIds: () => listedAgents.map((agent) => agent.id),
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
  const handleSearchChange = useCallback(
    (nextQuery: string) => {
      if (isEditing) {
        exitEditing();
      }
      setQuery(nextQuery);
    },
    [exitEditing, isEditing, setQuery],
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
        onPress: openCreateAgent,
        type: 'icon',
      },
    ],
    [openCreateAgent, t],
  );
  const doneActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.done'),
        disabled: isDeletionPending,
        key: 'finish-selecting-agents',
        label: t('common.done'),
        onPress: exitEditing,
        type: 'label',
      },
    ],
    [exitEditing, isDeletionPending, t],
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
  const listExtraData = useMemo<AgentListExtraData>(
    () => ({
      isEditing,
      lastId: listedAgents.at(-1)?.id,
      onEdit: openAgentEditor,
      onStartSelection: handleStartSelection,
      onToggle: toggleId,
      selectedIds,
    }),
    [handleStartSelection, isEditing, listedAgents, openAgentEditor, selectedIds, toggleId],
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
        onBack={isEditing ? exitEditing : undefined}
        rightActions={isEditing ? doneActions : rightActions}
        title={t('agent.list.title')}
      />
      <View className="flex-1">
        <InlineSearch onChangeText={handleSearchChange} value={query} />
        <LegendList
          alwaysBounceVertical={false}
          contentContainerStyle={listContentStyle}
          contentInsetAdjustmentBehavior="automatic"
          data={listedAgents}
          estimatedItemSize={AGENT_ROW_ESTIMATED_HEIGHT}
          extraData={listExtraData}
          keyExtractor={agentKeyExtractor}
          ListEmptyComponent={listEmpty}
          maintainVisibleContentPosition={false}
          recycleItems
          renderItem={renderAgentItem}
          showsVerticalScrollIndicator={false}
          style={styles.list}
        />
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

function renderAgentItem({ extraData, index, item }: LegendListRenderItemProps<Agent>) {
  const { isEditing, lastId, onEdit, onStartSelection, onToggle, selectedIds } =
    extraData as AgentListExtraData;
  const isFirst = index === 0;

  // Each row draws its slice of one grouped card, so the list stays virtualized.
  return (
    <View
      className={cn(
        'overflow-hidden bg-card',
        isFirst && 'rounded-t-2xl',
        item.id === lastId && 'rounded-b-2xl',
      )}
      style={styles.cardSlice}
    >
      {isFirst ? null : <View className="mx-4 h-px bg-border" />}
      <AgentListRow
        agent={item}
        isEditing={isEditing}
        isSelected={selectedIds.has(item.id)}
        onEdit={onEdit}
        onStartSelection={onStartSelection}
        onToggle={onToggle}
      />
    </View>
  );
}

type AgentListRowProps = {
  agent: Agent;
  isEditing: boolean;
  isSelected: boolean;
  onEdit: (agentId: string) => void;
  onStartSelection: (agentId: string) => void;
  onToggle: (agentId: string) => void;
};

const AgentListRow = memo(function AgentListRow({
  agent,
  isEditing,
  isSelected,
  onEdit,
  onStartSelection,
  onToggle,
}: AgentListRowProps) {
  const { t } = useTranslation();

  // Keep the press target and long-press handler mounted when selection starts,
  // so releasing that same touch cannot also toggle the row or open the editor.
  return (
    <Pressable
      accessibilityActions={
        isEditing ? undefined : [{ name: 'longpress', label: t('agent.selection.start') }]
      }
      accessibilityLabel={agent.name}
      accessibilityRole={isEditing ? 'checkbox' : 'link'}
      accessibilityState={isEditing ? { checked: isSelected } : undefined}
      className="w-full active:bg-foreground/5"
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'longpress') {
          onStartSelection(agent.id);
        }
      }}
      onLongPress={() => onStartSelection(agent.id)}
      onPress={() => {
        if (isEditing) {
          onToggle(agent.id);
        } else {
          onEdit(agent.id);
        }
      }}
      testID={`agent-list-${agent.id}`}
    >
      <View className="min-w-0 flex-row items-center gap-3 px-4 py-3">
        <AgentAvatar avatar={agent.avatar} name={agent.name} uri={agent.avatarUri} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-base text-foreground" numberOfLines={1}>
            {agent.name}
          </Text>
          <Text className="text-muted-foreground text-sm" numberOfLines={1}>
            {agent.modelName ?? t('agent.model.none')}
          </Text>
        </View>
        {isEditing ? (
          <SelectionIndicator selected={isSelected} />
        ) : (
          <ChevronRightIcon className="size-5 text-muted-foreground" />
        )}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  cardSlice: { borderCurve: 'continuous' },
  list: { flex: 1 },
});
