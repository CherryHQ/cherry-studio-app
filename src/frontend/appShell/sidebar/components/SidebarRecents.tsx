import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import { ActionMenu, ContentState, type MenuItem } from '@cherrystudio/ui/components';
import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { ContextMenuLink, type ContextMenuLinkItem } from '@/frontend/appShell/navigation';
import { chatHref } from '@/frontend/appShell/navigation/chat';
import { AgentAvatar } from '@/frontend/components/Avatar';
import {
  SessionListProvider,
  type SessionViewMode,
  useSessionActionAlerts,
  useSessionListSessions,
} from '@/frontend/components/SessionList';
import { useAgentsApi, useLatestAgentSession } from '@/frontend/hooks/agent';
import { appSidebar } from '@/frontend/utils/constants';
import type { AgentSessionEntity } from '@/shared/data/api/schemas/agentSessions';
import type { Agent } from '@/shared/data/types/agent';

import { useSidebarActions } from '../context';

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
  const isSessionMode = mode === 'sessions';
  const modeLabel = t(isSessionMode ? 'navigation.sessions' : 'navigation.agents');
  const menuItems = useMemo<readonly MenuItem[]>(
    () => [
      {
        checked: isSessionMode,
        id: 'show-sessions',
        label: t('navigation.sessions'),
        onPress: () => setMode('sessions'),
      },
      {
        checked: !isSessionMode,
        id: 'show-agents',
        label: t('navigation.agents'),
        onPress: () => setMode('agents'),
      },
    ],
    [isSessionMode, t],
  );

  return (
    <>
      <View className="px-5 pt-4 pb-1">
        <ActionMenu items={menuItems}>
          <View
            accessibilityLabel={t('navigation.chooseSidebarView')}
            accessibilityRole="button"
            className="min-h-10 flex-row items-center gap-1.5"
            testID="sidebar-recents-mode-toggle"
          >
            <Text className="text-muted-foreground text-sm">{modeLabel}</Text>
            <ChevronDownIcon className="size-4 text-muted-foreground" />
          </View>
        </ActionMenu>
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
    return (
      <View className="py-4">
        <ContentState.Loading title={t('session.list.loading')} />
      </View>
    );
  }

  if (sessionQueryError) {
    return (
      <View className="px-5 py-4">
        <ContentState.Error title={t('session.list.loadFailed')} />
      </View>
    );
  }

  if (visibleSessions.length === 0) {
    return (
      <View className="px-5 py-4">
        <ContentState.Empty description={t('session.list.empty')} />
      </View>
    );
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

  if (isLoading) {
    return (
      <View className="py-4">
        <ContentState.Loading title={t('agent.list.loading')} />
      </View>
    );
  }

  if (error) {
    return (
      <View className="px-5 py-4">
        <ContentState.Error title={t('agent.list.loadFailed')} />
      </View>
    );
  }

  if (agents.length === 0) {
    return (
      <View className="px-5 py-4">
        <ContentState.Empty description={t('agent.list.emptyTitle')} />
      </View>
    );
  }

  return agents.map((agent) => <SidebarAgentRow key={agent.id} agent={agent} />);
}

function SidebarAgentRow({ agent }: { agent: Agent }) {
  const { closeDrawer } = useSidebarActions('Sidebar agent row');
  const latestSession = useLatestAgentSession({ agentId: agent.id });
  const isResolvingSession = latestSession.isLoading || latestSession.isRefreshing;
  const href = chatHref(
    latestSession.session
      ? { kind: 'session', sessionId: latestSession.session.id }
      : { agentId: agent.id, kind: 'draft' },
  );

  return (
    <Link asChild href={href}>
      <Pressable
        accessibilityLabel={agent.name}
        accessibilityRole="link"
        accessibilityState={{ disabled: isResolvingSession }}
        className="w-full active:bg-sidebar-accent"
        disabled={isResolvingSession}
        onPress={closeDrawer}
      >
        <View className="flex-row items-center gap-3 px-5 py-2.5">
          <AgentAvatar
            accessibilityLabel={agent.name}
            name={agent.name}
            size={28}
            uri={agent.avatarUri}
          />
          <Text className="min-w-0 flex-1 text-base text-sidebar-foreground" numberOfLines={1}>
            {agent.name}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
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
