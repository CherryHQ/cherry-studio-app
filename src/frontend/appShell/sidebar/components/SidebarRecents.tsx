import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { ActionMenu, ContentState, type MenuItem, useToast } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import { useGlobalSearchParams, usePathname } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { ContextMenuLink, type ContextMenuLinkItem } from '@/frontend/appShell/navigation';
import {
  chatHref,
  type ChatRouteParamsInput,
  parseChatRoute,
} from '@/frontend/appShell/navigation/chat';
import { AgentAvatar } from '@/frontend/components/Avatar';
import {
  SessionListProvider,
  SessionStatus,
  type SessionViewMode,
  useSessionListActions,
  useSessionActionAlerts,
  useSessionListSessions,
} from '@/frontend/components/SessionList';
import { usePreference } from '@/frontend/data/hooks';
import { useAgentSession, useAgentsApi } from '@/frontend/hooks/agent';
import { appSidebar } from '@/frontend/utils/constants';
import type { AgentSessionEntity } from '@/shared/data/api/schemas/agentSessions';
import type { Agent } from '@/shared/data/types/agent';

import { useSidebarActions } from '../context';

type SidebarRecentsProps = {
  registerEndReachedHandler: (handler?: () => void) => void;
};

const SIDEBAR_LEADING_SIZE = 28;

function useSidebarChatTarget() {
  // The drawer sits outside the chat screen's local route context.
  const params = useGlobalSearchParams<ChatRouteParamsInput>();
  const pathname = usePathname();
  const route = parseChatRoute(params);
  return pathname === '/' && route.status === 'ready' ? route.target : undefined;
}

/** Only Agent groups reserve an icon column; ordinary conversation rows have no leading slot. */
function SidebarAgentIconSlot({ children }: { children?: ReactNode }) {
  return (
    <View className="shrink-0 items-center" style={{ width: SIDEBAR_LEADING_SIZE }}>
      {children}
    </View>
  );
}

function SidebarRowContent({
  children,
  className,
  leading,
}: {
  children: ReactNode;
  className?: string;
  leading?: ReactNode;
}) {
  return (
    <View className={cn('flex-row items-center gap-3 rounded-xl px-3 py-2.5', className)}>
      {leading}
      <View className="min-w-0 flex-1 flex-row items-center gap-2">{children}</View>
    </View>
  );
}

export function SidebarRecents({ registerEndReachedHandler }: SidebarRecentsProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [mode, setMode] = usePreference('ui.sidebar.recent_view_mode');
  const isSessionMode = mode === 'sessions';
  const modeLabel = t(isSessionMode ? 'navigation.sessions' : 'navigation.agents');
  const handleModeChange = useCallback(
    (nextMode: SessionViewMode) => {
      void setMode(nextMode).catch(() => {
        toast.show({ label: t('settings.privacy.saveFailed'), variant: 'danger' });
      });
    },
    [setMode, t, toast],
  );
  const menuItems = useMemo<readonly MenuItem[]>(
    () => [
      {
        checked: isSessionMode,
        id: 'show-sessions',
        label: t('navigation.sessions'),
        onPress: () => handleModeChange('sessions'),
      },
      {
        checked: !isSessionMode,
        id: 'show-agents',
        label: t('navigation.agents'),
        onPress: () => handleModeChange('agents'),
      },
    ],
    [handleModeChange, isSessionMode, t],
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
      {isSessionMode ? (
        <SessionListProvider>
          <SidebarRecentSessionList registerEndReachedHandler={registerEndReachedHandler} />
        </SessionListProvider>
      ) : (
        <SidebarAgentSessionList />
      )}
    </>
  );
}

function SidebarRecentSessionList({
  leading,
  registerEndReachedHandler,
}: {
  leading?: ReactNode;
  registerEndReachedHandler?: SidebarRecentsProps['registerEndReachedHandler'];
}) {
  const { t } = useTranslation();
  const target = useSidebarChatTarget();
  const selectedSessionId = target?.kind === 'session' ? target.sessionId : undefined;
  const [isShowingAllSessions, setIsShowingAllSessions] = useState(false);
  const [visibleSessionLimit, setVisibleSessionLimit] = useState<number>(
    appSidebar.recentSessionLimit,
  );
  const {
    hasMoreSessions,
    isLoadingMoreSessions,
    isSessionListLoading,
    sessionQueryError,
    sessions,
  } = useSessionListSessions();
  const { loadMoreSessions } = useSessionListActions();
  const { requestDelete, requestRename } = useSessionActionAlerts();
  const { closeDrawer } = useSidebarActions('Sidebar recent sessions');
  const visibleSessions = sessions.slice(0, visibleSessionLimit);
  // Agent groups page independently; only the flat list owns the drawer's end-reached handler.
  const canShowMoreSessions =
    (!isShowingAllSessions || !registerEndReachedHandler) &&
    (sessions.length > visibleSessionLimit || hasMoreSessions);
  const showMoreLabel = t(
    registerEndReachedHandler ? 'session.list.viewAll' : 'session.list.loadMore',
  );

  const revealNextSessionBatch = useCallback(() => {
    if (
      isLoadingMoreSessions ||
      sessionQueryError ||
      (visibleSessionLimit >= sessions.length && !hasMoreSessions)
    ) {
      return;
    }

    const nextLimit = visibleSessionLimit + appSidebar.recentSessionLimit;
    setVisibleSessionLimit(nextLimit);

    if (nextLimit > sessions.length && hasMoreSessions) {
      loadMoreSessions();
    }
  }, [
    hasMoreSessions,
    isLoadingMoreSessions,
    loadMoreSessions,
    sessionQueryError,
    sessions.length,
    visibleSessionLimit,
  ]);
  const handleEndReached = useCallback(() => {
    if (isShowingAllSessions) {
      revealNextSessionBatch();
    }
  }, [isShowingAllSessions, revealNextSessionBatch]);

  useEffect(() => {
    registerEndReachedHandler?.(handleEndReached);
    return () => registerEndReachedHandler?.();
  }, [handleEndReached, registerEndReachedHandler]);

  const handleViewAllPress = () => {
    setIsShowingAllSessions(true);
    revealNextSessionBatch();
  };

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

  return (
    <>
      <View className="px-2">
        {visibleSessions.map((session) => (
          <SidebarSessionRow
            key={session.id}
            isSelected={session.id === selectedSessionId}
            leading={leading}
            onCloseDrawer={closeDrawer}
            onDelete={requestDelete}
            onRename={requestRename}
            session={session}
          />
        ))}
      </View>
      {canShowMoreSessions ? (
        <View className="px-2">
          <Pressable
            accessibilityLabel={showMoreLabel}
            accessibilityRole="button"
            accessibilityState={{ disabled: isLoadingMoreSessions }}
            className="w-full active:bg-sidebar-accent"
            disabled={isLoadingMoreSessions}
            onPress={handleViewAllPress}
            testID="sidebar-sessions-view-all"
          >
            <SidebarRowContent leading={leading}>
              <Text className="min-w-0 flex-1 text-muted-foreground text-sm">{showMoreLabel}</Text>
            </SidebarRowContent>
          </Pressable>
        </View>
      ) : null}
      {isShowingAllSessions && isLoadingMoreSessions ? (
        <View className="px-2">
          <SidebarRowContent leading={leading}>
            <Text className="min-w-0 flex-1 text-muted-foreground text-sm">
              {t('session.list.loading')}
            </Text>
          </SidebarRowContent>
        </View>
      ) : null}
    </>
  );
}

function SidebarAgentSessionList() {
  const { t } = useTranslation();
  const { agents, error, isLoading } = useAgentsApi();
  const target = useSidebarChatTarget();
  const currentSession = useAgentSession(target?.kind === 'session' ? target.sessionId : undefined);
  const currentAgentId = target?.kind === 'draft' ? target.agentId : currentSession.data?.agentId;
  const defaultExpandedAgentId =
    currentAgentId ?? (currentSession.isLoading ? undefined : agents[0]?.id);

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

  return (
    <View className="gap-2">
      {agents.map((agent) => (
        <SidebarAgentRow
          key={agent.id}
          agent={agent}
          isDefaultExpanded={agent.id === defaultExpandedAgentId}
        />
      ))}
    </View>
  );
}

function SidebarAgentRow({
  agent,
  isDefaultExpanded,
}: {
  agent: Agent;
  isDefaultExpanded: boolean;
}) {
  // The current Agent can resolve after mount; explicit toggles take precedence over that default.
  const [isExpandedOverride, setIsExpandedOverride] = useState<boolean>();
  const isExpanded = isExpandedOverride ?? isDefaultExpanded;

  return (
    <View testID={`sidebar-agent-group-${agent.id}`}>
      <View className="px-2">
        <Pressable
          accessibilityLabel={agent.name}
          accessibilityRole="button"
          accessibilityState={{ expanded: isExpanded }}
          className="active:bg-sidebar-accent"
          onPress={() => setIsExpandedOverride((current) => !(current ?? isDefaultExpanded))}
          testID={`sidebar-agent-${agent.id}`}
        >
          <SidebarRowContent
            leading={
              <SidebarAgentIconSlot>
                <AgentAvatar
                  accessibilityLabel={agent.name}
                  avatar={agent.avatar}
                  name={agent.name}
                  size={SIDEBAR_LEADING_SIZE}
                  uri={agent.avatarUri}
                />
              </SidebarAgentIconSlot>
            }
          >
            <Text className="min-w-0 flex-1 text-base text-sidebar-foreground" numberOfLines={1}>
              {agent.name}
            </Text>
            {isExpanded ? (
              <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
            )}
          </SidebarRowContent>
        </Pressable>
      </View>
      {isExpanded ? (
        <SessionListProvider agentId={agent.id}>
          <SidebarRecentSessionList leading={<SidebarAgentIconSlot />} />
        </SessionListProvider>
      ) : null}
    </View>
  );
}

type SidebarSessionRowProps = {
  isSelected: boolean;
  leading?: ReactNode;
  onCloseDrawer: () => void;
  onDelete: (session: AgentSessionEntity) => void;
  onRename: (session: AgentSessionEntity) => void;
  session: AgentSessionEntity;
};

function SidebarSessionRow({
  isSelected,
  leading,
  onCloseDrawer,
  onDelete,
  onRename,
  session,
}: SidebarSessionRowProps) {
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
    <ContextMenuLink href={href} items={menuItems}>
      <Pressable
        accessibilityRole="link"
        accessibilityState={{ selected: isSelected }}
        className="w-full active:bg-sidebar-accent"
        onPress={onCloseDrawer}
        testID={`sidebar-session-${session.id}`}
      >
        <SidebarRowContent className={cn(isSelected && 'bg-secondary/70')} leading={leading}>
          <Text
            className={cn(
              'min-w-0 flex-1 text-base text-sidebar-foreground',
              isSelected && 'font-medium',
            )}
            numberOfLines={1}
          >
            {session.title || t('session.list.untitled')}
          </Text>
          <SessionStatus sessionId={session.id} />
        </SidebarRowContent>
      </Pressable>
    </ContextMenuLink>
  );
}
