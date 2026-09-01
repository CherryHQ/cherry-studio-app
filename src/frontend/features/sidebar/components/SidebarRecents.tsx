import ArrowLeftRightIcon from '@cherrystudio/app-icons/icons/arrow-left-right';
import BotIcon from '@cherrystudio/app-icons/icons/bot';
import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { ContentState } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { AgentAvatar } from '@/frontend/components/avatar';
import { ContextMenuLink, type ContextMenuLinkItem } from '@/frontend/components/navigation';
import { chatHref } from '@/frontend/components/navigation/chat';
import {
  SessionListProvider,
  type SessionViewMode,
  useSessionActionAlerts,
  useSessionListSessions,
} from '@/frontend/features/sessions';
import { useAgentsApi } from '@/frontend/hooks/agent';
import { appSidebar } from '@/frontend/utils/constants';
import type { AgentSessionEntity } from '@/shared/data/api/schemas/agentSessions';
import type { Agent } from '@/shared/data/types/agent';

import { useSidebarActions } from '../context';

const DELETED_AGENT_GROUP_ID = 'deleted-agent-sessions';

export function SidebarRecents() {
  return (
    <SessionListProvider>
      <SidebarRecentsView />
    </SessionListProvider>
  );
}

function SidebarRecentsView() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<SessionViewMode>('sessions');
  const { openSessionList } = useSidebarActions('Sidebar recents');
  const isSessionMode = mode === 'sessions';
  const modeLabel = t(isSessionMode ? 'navigation.recentSessions' : 'navigation.sessionsByAgent');
  const nextModeLabel = t(
    isSessionMode ? 'navigation.sessionsByAgent' : 'navigation.recentSessions',
  );

  const toggleMode = () => {
    setMode((current) => (current === 'sessions' ? 'agents' : 'sessions'));
  };
  const viewAll = () => {
    openSessionList(mode);
  };

  return (
    <>
      <View className="flex-row items-center justify-between px-5 pt-4 pb-1">
        <Pressable
          accessibilityLabel={t('navigation.switchRecentView', { view: nextModeLabel })}
          accessibilityRole="button"
          className="active:opacity-60"
          hitSlop={8}
          onPress={toggleMode}
          testID="sidebar-recents-mode-toggle"
        >
          <View className="flex-row items-center gap-1.5">
            <Text className="text-muted-foreground text-sm">{modeLabel}</Text>
            <ArrowLeftRightIcon className="size-3.5 text-muted-foreground" />
          </View>
        </Pressable>
        <Pressable
          accessibilityLabel={t('navigation.viewAll')}
          accessibilityRole="button"
          className="active:opacity-60"
          hitSlop={8}
          onPress={viewAll}
        >
          <Text className="text-muted-foreground text-sm">{t('navigation.viewAll')}</Text>
        </Pressable>
      </View>
      {isSessionMode ? <SidebarRecentSessionList /> : <SidebarAgentSessionList />}
    </>
  );
}

function SidebarRecentSessionList() {
  const { t } = useTranslation();
  const { isSessionListLoading, sessionQueryError, sessions } = useSessionListSessions();
  const { requestDelete, requestRename } = useSessionActionAlerts();
  const { closeDrawer } = useSidebarActions('Sidebar recent sessions');
  const visibleSessions = sessions.slice(0, appSidebar.recentSessionLimit);

  if (isSessionListLoading) {
    return <ContentState.Loading className="py-4" title={t('session.list.loading')} />;
  }

  if (sessionQueryError) {
    return <ContentState.Error className="px-5 py-4" title={t('session.list.loadFailed')} />;
  }

  if (visibleSessions.length === 0) {
    return <ContentState.Empty className="px-5 py-4" description={t('session.list.empty')} />;
  }

  return visibleSessions.map((session) => (
    <SidebarSessionRow
      key={session.id}
      onCloseDrawer={closeDrawer}
      onDelete={requestDelete}
      onRename={requestRename}
      session={session}
    />
  ));
}

function SidebarAgentSessionList() {
  const { t } = useTranslation();
  const { agents, error, isLoading } = useAgentsApi();
  const { sessions } = useSessionListSessions();
  const [expandedGroupId, setExpandedGroupId] = useState<string>();
  const activeAgentIds = new Set(agents.map((agent) => agent.id));
  const deletedAgentSessions = sessions
    .filter((session) => !activeAgentIds.has(session.agentId))
    .slice(0, appSidebar.recentSessionLimit);

  const toggleGroup = (groupId: string) => {
    setExpandedGroupId((current) => (current === groupId ? undefined : groupId));
  };

  if (isLoading) {
    return <ContentState.Loading className="py-4" title={t('agent.list.loading')} />;
  }

  if (error) {
    return <ContentState.Error className="px-5 py-4" title={t('agent.list.loadFailed')} />;
  }

  if (agents.length === 0 && deletedAgentSessions.length === 0) {
    return <ContentState.Empty className="px-5 py-4" description={t('agent.list.emptyTitle')} />;
  }

  return (
    <>
      {agents.map((agent) => (
        <SidebarAgentGroup
          key={agent.id}
          agent={agent}
          expanded={expandedGroupId === agent.id}
          onToggle={toggleGroup}
        />
      ))}
      {deletedAgentSessions.length > 0 ? (
        <SidebarDeletedAgentGroup
          expanded={expandedGroupId === DELETED_AGENT_GROUP_ID}
          onToggle={toggleGroup}
          sessions={deletedAgentSessions}
        />
      ) : null}
    </>
  );
}

function SidebarAgentGroup({
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
      <SidebarAgentGroupButton
        agent={agent}
        expanded={expanded}
        label={agent.name}
        onPress={() => onToggle(agent.id)}
      />
      {expanded ? (
        <View className="ml-9 border-border border-l">
          <SessionListProvider agentId={agent.id}>
            <SidebarExpandedSessionList />
          </SessionListProvider>
        </View>
      ) : null}
    </>
  );
}

function SidebarDeletedAgentGroup({
  expanded,
  onToggle,
  sessions,
}: {
  expanded: boolean;
  onToggle: (groupId: string) => void;
  sessions: readonly AgentSessionEntity[];
}) {
  const { t } = useTranslation();
  const label = t('session.list.deletedAgent');

  return (
    <>
      <SidebarAgentGroupButton
        expanded={expanded}
        label={label}
        onPress={() => onToggle(DELETED_AGENT_GROUP_ID)}
      />
      {expanded ? (
        <View className="ml-9 border-border border-l">
          <SidebarResolvedSessionList sessions={sessions} />
        </View>
      ) : null}
    </>
  );
}

function SidebarAgentGroupButton({
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
      className="w-full active:bg-sidebar-accent"
      onPress={onPress}
    >
      <View className="flex-row items-center gap-3 px-5 py-2.5">
        {agent ? (
          <AgentAvatar
            accessibilityLabel={label}
            name={agent.name}
            size={28}
            uri={agent.avatarUri}
          />
        ) : (
          <View className="size-7 items-center justify-center rounded-full bg-secondary">
            <BotIcon className="size-4 text-muted-foreground" />
          </View>
        )}
        <Text className="min-w-0 flex-1 text-base text-sidebar-foreground" numberOfLines={1}>
          {label}
        </Text>
        <DisclosureIcon className="size-4 text-muted-foreground" />
      </View>
    </Pressable>
  );
}

function SidebarExpandedSessionList() {
  const { t } = useTranslation();
  const { isSessionListLoading, sessionQueryError, sessions } = useSessionListSessions();

  if (isSessionListLoading) {
    return <ContentState.Loading className="py-4" />;
  }

  if (sessionQueryError) {
    return <ContentState.Error className="px-4 py-4" description={t('session.list.loadFailed')} />;
  }

  if (sessions.length === 0) {
    return <ContentState.Empty className="px-4 py-4" description={t('session.list.empty')} />;
  }

  return <SidebarResolvedSessionList sessions={sessions} />;
}

function SidebarResolvedSessionList({ sessions }: { sessions: readonly AgentSessionEntity[] }) {
  const { requestDelete, requestRename } = useSessionActionAlerts();
  const { closeDrawer } = useSidebarActions('Sidebar agent sessions');

  return sessions
    .slice(0, appSidebar.recentSessionLimit)
    .map((session) => (
      <SidebarSessionRow
        key={session.id}
        onCloseDrawer={closeDrawer}
        onDelete={requestDelete}
        onRename={requestRename}
        session={session}
      />
    ));
}

type SidebarSessionRowProps = {
  onCloseDrawer: () => void;
  onDelete: (session: AgentSessionEntity) => void;
  onRename: (session: AgentSessionEntity) => void;
  session: AgentSessionEntity;
};

function SidebarSessionRow({ onCloseDrawer, onDelete, onRename, session }: SidebarSessionRowProps) {
  const { t } = useTranslation();
  const href = chatHref({ kind: 'session', sessionId: session.id });
  const menuItems: readonly ContextMenuLinkItem[] = [
    {
      id: 'rename',
      label: t('common.rename'),
      onPress: () => onRename(session),
    },
    {
      destructive: true,
      id: 'delete',
      label: t('common.delete'),
      onPress: () => onDelete(session),
    },
  ];

  return (
    <ContextMenuLink href={href} items={menuItems} preview={false}>
      <Pressable
        accessibilityLabel={session.title || t('session.list.untitled')}
        accessibilityRole="link"
        className="w-full active:bg-sidebar-accent"
        onPress={onCloseDrawer}
      >
        <Text className="px-5 py-2.5 text-base text-sidebar-foreground" numberOfLines={1}>
          {session.title || t('session.list.untitled')}
        </Text>
      </Pressable>
    </ContextMenuLink>
  );
}
