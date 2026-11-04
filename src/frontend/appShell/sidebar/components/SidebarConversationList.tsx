import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import CircleAlertIcon from '@cherrystudio/app-icons/icons/circle-alert';
import {
  ContextMenu,
  ContentState,
  SelectionIndicator,
  Spinner,
  useAlert,
  useToast,
} from '@cherrystudio/ui/components';
import { duration, easing } from '@cherrystudio/ui/motion';
import { cn } from '@cherrystudio/ui/utils';
import { useRouter } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';

import {
  type AgentRef,
  type AgentSummary,
  type ConversationSummary,
  type ConversationListStatus,
  useConversationAgents,
  useConversationSessions,
  useConversationSource,
  useConversationSourceState,
  useConversationPreview,
} from '@/frontend/appShell/conversation';
import { ContextMenuLink, type ContextMenuLinkItem } from '@/frontend/appShell/navigation';
import { conversationHref, useConversationTarget } from '@/frontend/appShell/navigation/chat';
import { AgentAvatar } from '@/frontend/components/Avatar';
import { ConversationStatus } from '@/frontend/components/ConversationStatus';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { appSidebar } from '@/frontend/utils/constants';

import { useSidebarActions } from '../context';
import { useSidebarSelection, useSidebarSelectionSnapshot } from '../SidebarSelectionProvider';
import { SidebarAgentIconSlot, SidebarRowContent, SIDEBAR_LEADING_SIZE } from './SidebarRowContent';

type RegisterEndReached = (handler?: () => void) => void;

export type ConversationDestination =
  | { kind: 'agent'; agent: AgentSummary }
  | { kind: 'session'; session: ConversationSummary };

type SelectDestination = (destination: ConversationDestination) => void;

/** The sidebar's grouped catalog with destination callbacks instead of drawer management. */
export function ConversationDestinationList({ onSelect }: { onSelect: SelectDestination }) {
  return <SidebarAgentGroups onSelect={onSelect} showLoading />;
}

const rowLayout = LinearTransition.duration(duration.base)
  .easing(easing.settle)
  .reduceMotion(ReduceMotion.System);
const selectionEntrance = FadeIn.duration(duration.fast)
  .easing(easing.settle)
  .reduceMotion(ReduceMotion.System);
const rowExit = FadeOut.duration(duration.fast)
  .easing(easing.settle)
  .reduceMotion(ReduceMotion.System);

/** One catalog presentation for every conversation source. */
export function SidebarConversationList({
  mode,
  showLoading,
  registerEndReachedHandler,
}: {
  mode: 'agents' | 'sessions';
  showLoading: boolean;
  registerEndReachedHandler: RegisterEndReached;
}) {
  const source = useConversationSource();
  const { availability } = useConversationSourceState();
  const router = useRouter();
  const connectionId = source.ref.kind === 'desktop' ? source.ref.connectionId : undefined;
  return (
    <>
      <ConversationStatus
        availability={availability}
        onRepair={() => router.push('/settings/device-connections')}
        onOpenDeviceSettings={
          connectionId
            ? () =>
                router.push({
                  pathname: '/settings/device-connections/[connectionId]',
                  params: { connectionId },
                })
            : undefined
        }
      />
      <SidebarCatalog
        key={source.scope}
        mode={mode}
        showLoading={showLoading}
        registerEndReachedHandler={registerEndReachedHandler}
      />
    </>
  );
}

function SidebarCatalog({
  mode,
  showLoading,
  registerEndReachedHandler,
}: {
  mode: 'agents' | 'sessions';
  showLoading: boolean;
  registerEndReachedHandler: RegisterEndReached;
}) {
  return mode === 'agents' ? (
    <SidebarAgentGroups showLoading={showLoading} />
  ) : (
    <SidebarSessions
      showLoading={showLoading}
      registerEndReachedHandler={registerEndReachedHandler}
    />
  );
}

function SidebarAgentGroups({
  onSelect,
  showLoading,
}: {
  onSelect?: SelectDestination;
  showLoading: boolean;
}) {
  const { t } = useTranslation();
  const query = useConversationAgents();
  if (query.isPending)
    return showLoading && query.isLoading ? (
      <View className="py-4">
        <ContentState.Loading title={t('agent.list.loading')} />
      </View>
    ) : null;
  if (query.isError && !query.data)
    return (
      <View className="px-5 py-4">
        <ContentState.Error
          title={t('agent.list.loadFailed')}
          primaryAction={{ children: t('common.retry'), onPress: () => void query.refetch() }}
        />
      </View>
    );
  if (query.isSuccess && !query.items.length)
    return (
      <View className="px-5 py-4">
        <ContentState.Empty description={t('agent.list.emptyTitle')} />
      </View>
    );
  return (
    <View className="gap-2">
      {query.items.map((agent) => (
        <SidebarAgentGroup
          key={agent.id}
          agent={agent}
          onSelect={onSelect}
          showLoading={showLoading}
        />
      ))}
      {query.isError ? (
        <View className="px-2">
          <LoadMore label={t('common.retry')} onPress={() => void query.refetch()} />
        </View>
      ) : query.hasNextPage ? (
        <View className="px-2">
          <LoadMore
            disabled={query.isFetchingNextPage}
            onPress={() => void query.fetchNextPage()}
          />
        </View>
      ) : null}
    </View>
  );
}

/** Every group starts collapsed; only the user's toggle expands one. */
function SidebarAgentGroup({
  agent,
  onSelect,
  showLoading,
}: {
  agent: AgentSummary;
  onSelect?: SelectDestination;
  showLoading: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const toggle = () => setExpanded((value) => !value);
  const disclosure = expanded ? (
    <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
  ) : (
    <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
  );
  return (
    <View testID={`sidebar-agent-group-${agent.id}`}>
      <View className="px-2">
        {onSelect ? (
          <View className="flex-row items-center">
            <View className="min-w-0 flex-1">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('conversation.destination.new', { name: agent.name })}
                onPress={() => onSelect({ kind: 'agent', agent })}
                testID={`share-agent-${agent.id}`}
              >
                {({ pressed }) => <SidebarAgentRowContent agent={agent} pressed={pressed} />}
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(
                expanded ? 'conversation.destination.collapse' : 'conversation.destination.expand',
                { name: agent.name },
              )}
              accessibilityState={{ expanded }}
              onPress={toggle}
              testID={`share-agent-expand-${agent.id}`}
            >
              {({ pressed }) => (
                <View
                  className={cn(
                    'min-h-12 w-11 items-center justify-center rounded-xl',
                    pressed && 'bg-sidebar-accent',
                  )}
                >
                  {disclosure}
                </View>
              )}
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={agent.name}
            accessibilityState={{ expanded }}
            testID={`sidebar-agent-${agent.id}`}
            onPress={toggle}
          >
            {({ pressed }) => (
              <SidebarAgentRowContent agent={agent} pressed={pressed}>
                {disclosure}
              </SidebarAgentRowContent>
            )}
          </Pressable>
        )}
      </View>
      {expanded ? (
        <SidebarSessions agentRef={agent.ref} onSelect={onSelect} showLoading={showLoading} />
      ) : null}
    </View>
  );
}

function SidebarAgentRowContent({
  agent,
  children,
  pressed,
}: {
  agent: AgentSummary;
  children?: ReactNode;
  pressed: boolean;
}) {
  return (
    <SidebarRowContent
      className={cn('w-full', pressed && 'bg-sidebar-accent')}
      leading={
        <SidebarAgentIconSlot>
          <AgentAvatar
            name={agent.name}
            accessibilityLabel={agent.name}
            avatar={agent.avatar}
            emoji={agent.emoji}
            uri={agent.avatarUri}
            size={SIDEBAR_LEADING_SIZE}
          />
        </SidebarAgentIconSlot>
      }
    >
      <Text className="min-w-0 flex-1 text-base text-sidebar-foreground" numberOfLines={1}>
        {agent.name}
      </Text>
      {children}
    </SidebarRowContent>
  );
}

function SidebarSessions({
  agentRef,
  onSelect,
  registerEndReachedHandler,
  showLoading,
}: {
  agentRef?: AgentRef;
  onSelect?: SelectDestination;
  registerEndReachedHandler?: RegisterEndReached;
  showLoading: boolean;
}) {
  const { t } = useTranslation();
  const source = useConversationSource();
  const navigation = useConversationTarget(source.ref);
  const query = useConversationSessions(agentRef);
  const [showAll, setShowAll] = useState(false);
  const [limit, setLimit] = useState<number>(appSidebar.recentSessionLimit);
  const leading = agentRef ? <SidebarAgentIconSlot /> : undefined;
  const { hasNextPage, isFetchingNextPage, fetchNextPage, items: sessions, isError } = query;
  const loadMore = useCallback(() => {
    if (isFetchingNextPage || isError || (limit >= sessions.length && !hasNextPage)) return;
    const next = limit + appSidebar.recentSessionLimit;
    setShowAll(true);
    setLimit(next);
    if (next > sessions.length && hasNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isError, limit, sessions.length]);
  useEffect(() => {
    registerEndReachedHandler?.(showAll ? loadMore : undefined);
    return () => registerEndReachedHandler?.();
  }, [loadMore, registerEndReachedHandler, showAll]);
  if (query.isPending)
    return showLoading && query.isLoading ? (
      <View className="py-4">
        <ContentState.Loading title={t('session.list.loading')} />
      </View>
    ) : null;
  if (query.isError && !query.data)
    return (
      <View className="px-5 py-4">
        <ContentState.Error
          title={t('session.list.loadFailed')}
          primaryAction={{ children: t('common.retry'), onPress: () => void query.refetch() }}
        />
      </View>
    );
  if (query.isSuccess && !sessions.length)
    return (
      <View className="px-5 py-4">
        <ContentState.Empty description={t('session.list.empty')} />
      </View>
    );
  return (
    <View className="px-2">
      {onSelect ? null : (
        <SidebarSessionSelectionRegistration
          agentRef={agentRef}
          sessions={sessions}
          limit={limit}
        />
      )}
      {sessions
        .slice(0, limit)
        .map((session) =>
          onSelect ? (
            <DestinationSessionRow
              key={session.ref.sessionId}
              leading={leading}
              onSelect={onSelect}
              session={session}
            />
          ) : (
            <SidebarSessionRow
              key={session.ref.sessionId}
              session={session}
              selectionKey={JSON.stringify([source.scope, session.ref.sessionId])}
              leading={leading}
              selected={session.ref.sessionId === navigation.sessionId}
            />
          ),
        )}
      {query.isError ? (
        <LoadMore
          leading={leading}
          label={t('common.retry')}
          onPress={() => void query.refetch()}
        />
      ) : (!showAll || !registerEndReachedHandler) && (sessions.length > limit || hasNextPage) ? (
        <LoadMore
          onPress={loadMore}
          testID="sidebar-sessions-view-all"
          disabled={isFetchingNextPage}
          leading={leading}
          label={registerEndReachedHandler ? t('session.list.viewAll') : undefined}
        />
      ) : null}
      {showAll && isFetchingNextPage ? (
        <SidebarRowContent leading={leading}>
          <Text className="min-w-0 flex-1 text-muted-foreground text-sm">
            {t('session.list.loading')}
          </Text>
        </SidebarRowContent>
      ) : null}
    </View>
  );
}

/** Drawer management stays out of the destination picker. */
function SidebarSessionSelectionRegistration({
  agentRef,
  limit,
  sessions,
}: {
  agentRef?: AgentRef;
  limit: number;
  sessions: readonly ConversationSummary[];
}) {
  const source = useConversationSource();
  const { registerList } = useSidebarSelection();
  useEffect(
    () => registerList(`${source.scope}:${agentRef ?? ''}`, source, sessions.slice(0, limit)),
    [agentRef, limit, registerList, sessions, source],
  );
  return null;
}

function DestinationSessionRow({
  leading,
  onSelect,
  session,
}: {
  leading?: ReactNode;
  onSelect: SelectDestination;
  session: ConversationSummary;
}) {
  const { t } = useTranslation();
  const { status } = useConversationPreview(session.ref);
  return (
    <Pressable
      accessibilityLabel={session.title || t('session.list.untitled')}
      accessibilityRole="button"
      onPress={() => onSelect({ kind: 'session', session })}
      testID={`share-session-${session.ref.sessionId}`}
    >
      {({ pressed }) => (
        <SidebarRowContent
          leading={leading}
          className={cn('w-full', pressed && 'bg-sidebar-accent')}
        >
          <SidebarSessionContent title={session.title} status={status} />
        </SidebarRowContent>
      )}
    </Pressable>
  );
}

function SidebarSessionRow({
  session,
  selectionKey,
  leading,
  selected,
}: {
  session: ConversationSummary;
  selectionKey: string;
  leading?: ReactNode;
  selected: boolean;
}) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const { closeDrawer } = useSidebarActions('Sidebar session');
  const { rename, remove, status } = useConversationPreview(session.ref);
  const selection = useSidebarSelection();
  const isSelecting = useSidebarSelectionSnapshot((state) => state.isSelecting);
  const isDeleting = useSidebarSelectionSnapshot((state) => state.isDeleting);
  const checked = useSidebarSelectionSnapshot((state) => state.selectedIds.has(selectionKey));
  const deleted = useSidebarSelectionSnapshot((state) => state.deletedIds.has(selectionKey));
  if (deleted) return null;
  const menu: ContextMenuLinkItem[] = [];
  if (rename)
    menu.push({
      id: 'rename',
      label: t('common.rename'),
      disabled: rename.availability.state !== 'enabled',
      onPress: () => {
        alert.prompt({
          title: t('session.renameTitle'),
          confirmLabel: t('common.save'),
          input: {
            accessibilityLabel: t('session.renameTitle'),
            autoFocus: true,
            initialValue: session.title,
            maxLength: 255,
            placeholder: t('session.rename.placeholder'),
          },
          onConfirm: (title) => {
            const trimmed = title.trim();
            if (!trimmed || trimmed === session.title) return;
            void rename
              .execute({ title: trimmed })
              .then((result) => {
                if (result.state !== 'applied')
                  toast.show({ label: t('session.rename.failed'), variant: 'danger' });
              })
              .catch(() => toast.show({ label: t('session.rename.failed'), variant: 'danger' }));
          },
        });
      },
    });
  if (remove) {
    menu.push({
      id: 'select-multiple',
      label: t('session.selection.start'),
      disabled: isDeleting || remove.availability.state !== 'enabled',
      onPress: () => selection.enter(selectionKey),
    });
    menu.push({
      id: 'delete',
      destructive: true,
      label: t('common.delete'),
      disabled: remove.availability.state !== 'enabled',
      onPress: () => {
        alert.confirm({
          title: t('session.deleteTitle'),
          description: t('session.deleteMessage'),
          confirmLabel: t('common.delete'),
          role: 'destructive',
          onConfirm: () => {
            void remove
              .execute(undefined)
              .then((result) => {
                if (result.state !== 'applied')
                  toast.show({ label: t('session.deleteFailed'), variant: 'danger' });
              })
              .catch(() => toast.show({ label: t('session.deleteFailed'), variant: 'danger' }));
          },
        });
      },
    });
  }
  const row = (
    <ContextMenu.Trigger
      accessibilityLabel={session.title || t('session.list.untitled')}
      accessibilityRole={isSelecting ? 'checkbox' : 'link'}
      accessibilityState={
        isSelecting
          ? { checked, disabled: isDeleting || remove?.availability.state !== 'enabled' }
          : { selected, disabled: isDeleting }
      }
      disabled={isDeleting || (isSelecting && remove?.availability.state !== 'enabled')}
      onPress={isSelecting ? () => selection.toggle(selectionKey) : closeDrawer}
      testID={`sidebar-session-${session.ref.sessionId}`}
    >
      {({ pressed }) => (
        <SidebarRowContent
          leading={leading}
          className={cn(
            'w-full',
            !isSelecting && selected && 'bg-secondary/70',
            pressed && 'bg-sidebar-accent',
          )}
        >
          <SidebarSessionContent
            title={session.title}
            status={status}
            isSelected={!isSelecting && selected}
          />
          {isSelecting ? (
            <Animated.View entering={selectionEntrance} exiting={rowExit}>
              <SelectionIndicator
                disabled={isDeleting || remove?.availability.state !== 'enabled'}
                selected={checked}
              />
            </Animated.View>
          ) : null}
        </SidebarRowContent>
      )}
    </ContextMenu.Trigger>
  );
  return (
    <Animated.View layout={rowLayout} exiting={rowExit}>
      {isSelecting ? (
        row
      ) : (
        <ContextMenuLink href={conversationHref(session.ref)} items={isDeleting ? [] : menu}>
          {row}
        </ContextMenuLink>
      )}
    </Animated.View>
  );
}

function SidebarSessionContent({
  title,
  status,
  isSelected = false,
}: {
  title: string;
  status?: ConversationListStatus;
  isSelected?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Text
        className={cn(
          'min-w-0 flex-1 text-base text-sidebar-foreground',
          isSelected && 'font-medium',
        )}
        numberOfLines={1}
      >
        {title || t('session.list.untitled')}
      </Text>
      <SidebarSessionStatus status={status} />
    </>
  );
}

function SidebarSessionStatus({ status }: { status?: ConversationListStatus }) {
  const { t } = useTranslation();
  const color = useThemeColor('foreground-tertiary');
  if (status === 'awaiting-approval' || status === 'awaiting-input')
    return (
      <View className="shrink-0 rounded-full border border-warning-border bg-warning-subtle px-1.5">
        <Text className="font-medium text-warning-subtle-foreground text-xs" numberOfLines={1}>
          {t(
            status === 'awaiting-input'
              ? 'chat.question.waiting'
              : 'session.status.awaitingApproval',
          )}
        </Text>
      </View>
    );
  if (!status) return null;
  return (
    <View className="shrink-0 flex-row items-center gap-1">
      {status === 'running' ? (
        <Spinner accessible={false} color={color} size="sm" />
      ) : status === 'failed' ? (
        <CircleAlertIcon accessible={false} className="size-3 text-error" />
      ) : (
        <View className="size-1.5 rounded-full bg-success" />
      )}
      <Text className="text-foreground-tertiary text-xs" numberOfLines={1}>
        {t(
          status === 'running'
            ? 'session.status.running'
            : status === 'failed'
              ? 'session.status.failed'
              : 'session.status.completed',
        )}
      </Text>
    </View>
  );
}

function LoadMore({
  onPress,
  disabled,
  leading,
  label,
  testID,
}: {
  onPress(): void;
  disabled?: boolean;
  leading?: ReactNode;
  label?: string;
  testID?: string;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityLabel={label ?? t('session.list.loadMore')}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
    >
      {({ pressed }) => (
        <SidebarRowContent
          className={cn('w-full', pressed && 'bg-sidebar-accent')}
          leading={leading}
        >
          <Text className="min-w-0 flex-1 text-muted-foreground text-sm">
            {label ?? t('session.list.loadMore')}
          </Text>
        </SidebarRowContent>
      )}
    </Pressable>
  );
}
