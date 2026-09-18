import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import { ActionMenu, ContentState, type MenuItem } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import { useRouter } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { useChatSource } from '@/frontend/appShell/navigation/chat';
import {
  RemoteAgentProvider,
  RemoteConnectionBanner,
  useRemoteAgents,
  useRemoteConnection,
  useRemoteSessions,
} from '@/frontend/appShell/remoteAgent';
import { AgentAvatar } from '@/frontend/components/Avatar';
import { useDesktopConnections } from '@/frontend/hooks/useDesktopConnections';
import type { ControllerAgent } from '@/shared/contracts/agent/controller';

import NewConversationIcon from '../../icons/NewConversationIcon';
import { useSidebarActions } from '../context';
import { SidebarAgentIconSlot, SidebarRowContent, SIDEBAR_LEADING_SIZE } from './SidebarRowContent';

type Props = {
  mode: 'agents' | 'sessions';
  registerEndReachedHandler: (handler?: () => void) => void;
};

export function SidebarRemoteRecents({
  header,
  mode,
  registerEndReachedHandler,
}: Props & { header: ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { remoteTarget, openRemote } = useChatSource();
  const { connections, isLoading: isLoadingDevices } = useDesktopConnections();
  const connectionId = remoteTarget.connectionId;
  const isSelectingDevice =
    isLoadingDevices || connections.some((connection) => connection.status === 'paired');
  const selected = connections.find((connection) => connection.id === connectionId);
  const [loadingFeedback, setLoadingFeedback] = useState<{ connectionId?: string }>();
  useEffect(() => {
    // One delay spans controller acquisition, connection, and the first list request.
    const timer = setTimeout(() => setLoadingFeedback({ connectionId }), 200);
    return () => clearTimeout(timer);
  }, [connectionId]);
  const showLoading = Boolean(loadingFeedback && loadingFeedback.connectionId === connectionId);
  const loading = showLoading ? <ContentState.Loading title={t('remoteAgent.loading')} /> : null;
  const items: readonly MenuItem[] = connections.map((connection) => ({
    id: connection.id,
    label: connection.name,
    checked: connection.id === selected?.id,
    onPress: () => openRemote({ connectionId: connection.id }),
  }));
  const deviceMenu =
    connections.length > 1 ? (
      <View className="px-5 pb-2">
        <ActionMenu items={items}>
          <View
            accessibilityRole="button"
            accessibilityLabel={selected?.name ?? t('navigation.remote')}
            className="min-h-10 flex-row items-center gap-2"
            testID="sidebar-remote-device"
          >
            <Text className="min-w-0 shrink text-sm text-sidebar-foreground" numberOfLines={1}>
              {selected?.name ?? t('navigation.remote')}
            </Text>
            <ChevronDownIcon className="size-4 text-muted-foreground" />
          </View>
        </ActionMenu>
      </View>
    ) : null;
  return connectionId ? (
    <RemoteAgentProvider
      key={connectionId}
      connectionId={connectionId}
      renderFallback={(state) => (
        <RemoteSidebarFrame header={header} deviceMenu={deviceMenu}>
          {state === 'loading' ? (
            loading
          ) : (
            <ContentState.Error title={t('remoteAgent.loadFailed')} />
          )}
        </RemoteSidebarFrame>
      )}
    >
      <RemoteSidebarFrame
        header={header}
        deviceMenu={deviceMenu}
        status={<RemoteConnectionStatus name={selected?.name ?? ''} />}
      >
        <RemoteSidebarContent
          key={mode}
          mode={mode}
          showLoading={showLoading}
          registerEndReachedHandler={registerEndReachedHandler}
        />
      </RemoteSidebarFrame>
    </RemoteAgentProvider>
  ) : (
    <RemoteSidebarFrame header={header} deviceMenu={deviceMenu}>
      {isSelectingDevice ? (
        loading
      ) : (
        <View className="px-5 py-4">
          <ContentState.Empty
            title={t('settings.deviceConnections.empty')}
            description={t('settings.deviceConnections.emptyDescription')}
            primaryAction={{
              children: t('settings.deviceConnections.scan.action'),
              onPress: () => router.push('/settings/device-connections/scan'),
            }}
          />
        </View>
      )}
    </RemoteSidebarFrame>
  );
}

function RemoteSidebarFrame({
  header,
  deviceMenu,
  status,
  children,
}: {
  header: ReactNode;
  deviceMenu: ReactNode;
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <View className="flex-row items-center gap-2 px-5 pt-4 pb-1">
        {header}
        <View className="size-1.5 shrink-0">{status}</View>
      </View>
      {deviceMenu}
      {children}
    </>
  );
}

function RemoteConnectionStatus({ name }: { name: string }) {
  const { t } = useTranslation();
  const connection = useRemoteConnection();
  return connection.status === 'ready' ? (
    <View
      accessible
      accessibilityLabel={t('remoteAgent.connected', { name })}
      accessibilityRole="image"
      className="size-1.5 shrink-0 rounded-full bg-success"
      testID="sidebar-remote-connected"
    />
  ) : null;
}

function RemoteSidebarContent(props: Props & { showLoading: boolean }) {
  const connection = useRemoteConnection();
  return (
    <>
      {connection.status === 'unavailable' || connection.status === 'closed' ? (
        <RemoteConnectionBanner />
      ) : null}
      {props.mode === 'agents' ? (
        <RemoteAgentGroups key={connection.sourceKey} showLoading={props.showLoading} />
      ) : (
        <RemoteSessions
          key={connection.sourceKey}
          showLoading={props.showLoading}
          registerEndReachedHandler={props.registerEndReachedHandler}
        />
      )}
    </>
  );
}

function RemoteAgentGroups({ showLoading }: { showLoading: boolean }) {
  const { t } = useTranslation();
  const query = useRemoteAgents();
  const { remoteTarget } = useChatSource();
  const currentAgentId = remoteTarget.agentId ?? query.agents[0]?.id;
  if (query.isPending)
    return showLoading ? <ContentState.Loading title={t('remoteAgent.loading')} /> : null;
  if (query.isError && !query.data)
    return (
      <ContentState.Error
        title={t('remoteAgent.loadFailed')}
        primaryAction={{ children: t('common.retry'), onPress: () => void query.refetch() }}
      />
    );
  return (
    <View className="gap-2">
      {query.agents.map((agent) => (
        <RemoteAgentGroup
          agent={agent}
          key={agent.id}
          isDefaultExpanded={agent.id === currentAgentId}
          showLoading={showLoading}
        />
      ))}
      {query.isSuccess && !query.agents.length ? (
        <ContentState.Empty title={t('remoteAgent.noAgents')} />
      ) : null}
      {query.hasNextPage ? (
        <LoadMore onPress={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage} />
      ) : null}
    </View>
  );
}

function RemoteAgentGroup({
  agent,
  isDefaultExpanded,
  showLoading,
}: {
  agent: ControllerAgent;
  isDefaultExpanded: boolean;
  showLoading: boolean;
}) {
  const { t } = useTranslation();
  const { startRemoteChat } = useChatSource();
  const { closeDrawer } = useSidebarActions('Remote Agent group');
  const [override, setOverride] = useState<boolean>();
  const expanded = override ?? isDefaultExpanded;
  return (
    <View>
      {/* Sibling targets keep new-chat presses separate from group expansion. */}
      <View className="flex-row items-center px-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={agent.name}
          accessibilityState={{ expanded }}
          className="min-w-0 flex-1 active:bg-sidebar-accent"
          onPress={() => setOverride((value) => !(value ?? isDefaultExpanded))}
        >
          <SidebarRowContent
            leading={
              <SidebarAgentIconSlot>
                <AgentAvatar name={agent.name} size={SIDEBAR_LEADING_SIZE} />
              </SidebarAgentIconSlot>
            }
          >
            <Text className="min-w-0 flex-1 text-base text-sidebar-foreground" numberOfLines={1}>
              {agent.name}
            </Text>
          </SidebarRowContent>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('navigation.newChat')}
          className="size-11 shrink-0 items-center justify-center rounded-xl active:bg-sidebar-accent"
          onPress={() => {
            closeDrawer();
            startRemoteChat(agent.id);
          }}
        >
          <NewConversationIcon className="size-5 text-sidebar-foreground" />
        </Pressable>
      </View>
      {expanded ? <RemoteSessions agentId={agent.id} showLoading={showLoading} /> : null}
    </View>
  );
}

function RemoteSessions({
  agentId,
  registerEndReachedHandler,
  showLoading,
}: {
  agentId?: string;
  registerEndReachedHandler?: Props['registerEndReachedHandler'];
  showLoading: boolean;
}) {
  const { t } = useTranslation();
  const { remoteTarget, openRemote } = useChatSource();
  const { closeDrawer } = useSidebarActions('Remote sessions');
  const query = useRemoteSessions(agentId);
  const [showAll, setShowAll] = useState(false);
  const [limit, setLimit] = useState(10);
  const leading = agentId ? <SidebarAgentIconSlot /> : undefined;
  const { hasNextPage, isFetchingNextPage, fetchNextPage, sessions } = query;
  const loadMore = useCallback(() => {
    if (isFetchingNextPage) return;
    setShowAll(true);
    setLimit((value) => value + 10);
    if (limit + 10 > sessions.length && hasNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, limit, sessions.length]);
  useEffect(() => {
    registerEndReachedHandler?.(showAll ? loadMore : undefined);
    return () => registerEndReachedHandler?.();
  }, [loadMore, registerEndReachedHandler, showAll]);
  if (query.isPending)
    return showLoading ? <ContentState.Loading title={t('remoteAgent.loading')} /> : null;
  if (query.isError && !query.data)
    return (
      <ContentState.Error
        title={t('remoteAgent.loadFailed')}
        primaryAction={{ children: t('common.retry'), onPress: () => void query.refetch() }}
      />
    );
  return (
    <View className="px-2">
      {sessions.slice(0, limit).map((session) => {
        const selected = session.id === remoteTarget.sessionId;
        return (
          <Pressable
            key={session.id}
            accessibilityRole="link"
            accessibilityState={{ selected }}
            className="active:bg-sidebar-accent"
            onPress={() => {
              closeDrawer();
              openRemote({
                connectionId: remoteTarget.connectionId,
                agentId: session.agentId,
                sessionId: session.id,
              });
            }}
          >
            <SidebarRowContent leading={leading} className={cn(selected && 'bg-secondary/70')}>
              <Text
                className={cn(
                  'min-w-0 flex-1 text-base text-sidebar-foreground',
                  selected && 'font-medium',
                )}
                numberOfLines={1}
              >
                {session.name || t('session.list.untitled')}
              </Text>
            </SidebarRowContent>
          </Pressable>
        );
      })}
      {query.isSuccess && !sessions.length ? (
        <SidebarRowContent leading={leading}>
          <Text className="text-sm text-muted-foreground">{t('session.list.empty')}</Text>
        </SidebarRowContent>
      ) : null}
      {sessions.length > limit || hasNextPage ? (
        <LoadMore onPress={loadMore} disabled={isFetchingNextPage} grouped={Boolean(agentId)} />
      ) : null}
    </View>
  );
}

function LoadMore({
  onPress,
  disabled,
  grouped,
}: {
  onPress(): void;
  disabled: boolean;
  grouped?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
    >
      <SidebarRowContent leading={grouped ? <SidebarAgentIconSlot /> : undefined}>
        <Text className="text-sm text-muted-foreground">
          {t(disabled ? 'session.list.loading' : 'session.list.loadMore')}
        </Text>
      </SidebarRowContent>
    </Pressable>
  );
}
