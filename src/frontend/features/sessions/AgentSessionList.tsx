import BotIcon from '@cherrystudio/app-icons/icons/bot';
import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { Button, ContentState } from '@cherrystudio/ui/components';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { AgentAvatar } from '@/frontend/components/avatar';
import { useListBottomInset } from '@/frontend/components/selection';
import { useAgentsApi } from '@/frontend/hooks/agent';
import type { AgentSessionEntity } from '@/shared/data/api/schemas/agentSessions';
import type { Agent } from '@/shared/data/types/agent';

import { useSessionActionAlerts } from './components/useSessionActionAlerts';
import {
  SessionListProvider,
  useSessionListActions,
  useSessionListSessions,
} from './context/SessionListProvider';
import { useSessionListInitialData } from './hooks/useSessionListInitialData';
import { SessionRow } from './SessionList';

const DELETED_AGENT_GROUP_ID = 'deleted-agent-sessions';
const AGENT_GROUP_ESTIMATED_HEIGHT = 60;
const noop = () => {};

type AgentSessionGroup =
  | { agent: Agent; id: string; type: 'agent' }
  | { id: typeof DELETED_AGENT_GROUP_ID; type: 'deleted' };

export function AgentSessionList() {
  return (
    <SessionListProvider>
      <AgentSessionListView />
    </SessionListProvider>
  );
}

function AgentSessionListView() {
  const { t } = useTranslation();
  const bottomInset = useListBottomInset();
  const { agents, error: agentsError, isLoading: areAgentsLoading } = useAgentsApi();
  const {
    isSessionListLoading,
    sessionQueryError,
    sessions: recentSessions,
  } = useSessionListSessions();
  const [expandedGroupId, setExpandedGroupId] = useState<string>();
  const activeAgentIds = new Set(agents.map((agent) => agent.id));
  const deletedAgentSessions = recentSessions.filter(
    (session) => !activeAgentIds.has(session.agentId),
  );
  const groups: AgentSessionGroup[] = agents.map((agent) => ({
    agent,
    id: agent.id,
    type: 'agent',
  }));
  if (deletedAgentSessions.length > 0) {
    groups.push({ id: DELETED_AGENT_GROUP_ID, type: 'deleted' });
  }

  const isInitialDataSettled = useSessionListInitialData({
    agents: { error: agentsError, isLoading: areAgentsLoading },
    sessions: { error: sessionQueryError, isLoading: isSessionListLoading },
  });
  const initialLoadError = agentsError ?? sessionQueryError;
  const toggleGroup = (groupId: string) => {
    setExpandedGroupId((current) => (current === groupId ? undefined : groupId));
  };

  const renderItem = ({ item }: LegendListRenderItemProps<AgentSessionGroup>) => {
    const expanded = expandedGroupId === item.id;

    return item.type === 'agent' ? (
      <AgentSessionGroupRow agent={item.agent} expanded={expanded} onToggle={toggleGroup} />
    ) : (
      <DeletedAgentSessionGroupRow
        expanded={expanded}
        onToggle={toggleGroup}
        sessions={deletedAgentSessions}
      />
    );
  };

  const emptyState = !isInitialDataSettled ? (
    <ContentState.Loading className="px-8 py-16" title={t('session.list.loading')} />
  ) : initialLoadError ? (
    <ContentState.Error className="px-8 py-16" title={t('session.list.loadFailed')} />
  ) : (
    <ContentState.Empty
      className="px-8 py-16"
      description={t('session.list.emptyDescription')}
      icon={
        <ContentState.Icon>
          <BotIcon className="size-7 text-foreground" />
        </ContentState.Icon>
      }
      layout="page"
      title={t('session.list.empty')}
    />
  );

  return (
    <LegendList
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: bottomInset, paddingHorizontal: 8 }}
      data={isInitialDataSettled && !initialLoadError ? groups : []}
      estimatedItemSize={AGENT_GROUP_ESTIMATED_HEIGHT}
      keyExtractor={(item) => item.id}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={emptyState}
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
    />
  );
}

function AgentSessionGroupRow({
  agent,
  expanded,
  onToggle,
}: {
  agent: Agent;
  expanded: boolean;
  onToggle: (groupId: string) => void;
}) {
  return (
    <>
      <AgentGroupButton
        agent={agent}
        expanded={expanded}
        label={agent.name}
        onPress={() => onToggle(agent.id)}
      />
      {expanded ? (
        <SessionListProvider agentId={agent.id}>
          <ExpandedAgentSessions agentName={agent.name} />
        </SessionListProvider>
      ) : null}
    </>
  );
}

function DeletedAgentSessionGroupRow({
  expanded,
  onToggle,
  sessions,
}: {
  expanded: boolean;
  onToggle: (groupId: string) => void;
  sessions: readonly AgentSessionEntity[];
}) {
  const { t } = useTranslation();
  const { hasMoreSessions, isLoadingMoreSessions } = useSessionListSessions();
  const { loadMoreSessions } = useSessionListActions();
  const label = t('session.list.deletedAgent');

  return (
    <>
      <AgentGroupButton
        expanded={expanded}
        label={label}
        onPress={() => onToggle(DELETED_AGENT_GROUP_ID)}
      />
      {expanded ? (
        <View className="pl-8">
          <ResolvedAgentSessions agentName={undefined} sessions={sessions} />
          {hasMoreSessions ? (
            <LoadMoreSessionsButton loading={isLoadingMoreSessions} onPress={loadMoreSessions} />
          ) : null}
        </View>
      ) : null}
    </>
  );
}

function AgentGroupButton({
  agent,
  expanded,
  label,
  onPress,
}: {
  agent?: Agent;
  expanded: boolean;
  label: string;
  onPress: () => void;
}) {
  const DisclosureIcon = expanded ? ChevronDownIcon : ChevronRightIcon;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      className="w-full active:bg-secondary"
      onPress={onPress}
    >
      <View className="min-h-15 flex-row items-center gap-3 border-border border-b px-3 py-2">
        {agent ? (
          <AgentAvatar accessibilityLabel={label} name={agent.name} uri={agent.avatarUri} />
        ) : (
          <View className="size-10 items-center justify-center rounded-full bg-secondary">
            <BotIcon className="size-5 text-muted-foreground" />
          </View>
        )}
        <Text className="min-w-0 flex-1 font-semibold text-base text-foreground" numberOfLines={1}>
          {label}
        </Text>
        <DisclosureIcon className="size-5 text-muted-foreground" />
      </View>
    </Pressable>
  );
}

function ExpandedAgentSessions({ agentName }: { agentName: string }) {
  const { t } = useTranslation();
  const {
    hasMoreSessions,
    isLoadingMoreSessions,
    isSessionListLoading,
    sessionQueryError,
    sessions,
  } = useSessionListSessions();
  const { loadMoreSessions } = useSessionListActions();

  if (isSessionListLoading) {
    return <ContentState.Loading className="py-6" title={t('session.list.loading')} />;
  }

  if (sessionQueryError) {
    return <ContentState.Error className="px-6 py-6" title={t('session.list.loadFailed')} />;
  }

  if (sessions.length === 0) {
    return <ContentState.Empty className="px-6 py-6" title={t('session.list.empty')} />;
  }

  return (
    <View className="pl-8">
      <ResolvedAgentSessions agentName={agentName} sessions={sessions} />
      {hasMoreSessions ? (
        <LoadMoreSessionsButton loading={isLoadingMoreSessions} onPress={loadMoreSessions} />
      ) : null}
    </View>
  );
}

function ResolvedAgentSessions({
  agentName,
  sessions,
}: {
  agentName: string | undefined;
  sessions: readonly AgentSessionEntity[];
}) {
  const { requestDelete, requestRename } = useSessionActionAlerts();

  return sessions.map((session) => (
    <SessionRow
      key={session.id}
      agentName={agentName}
      isEditing={false}
      isSelected={false}
      onDelete={requestDelete}
      onRename={requestRename}
      onToggle={noop}
      session={session}
    />
  ));
}

function LoadMoreSessionsButton({ loading, onPress }: { loading: boolean; onPress: () => void }) {
  const { t } = useTranslation();

  return (
    <View className="items-center border-border border-b py-2">
      <Button loading={loading} onPress={onPress} size="sm" variant="ghost">
        <Button.Label>{t('session.list.loadMore')}</Button.Label>
      </Button>
    </View>
  );
}
