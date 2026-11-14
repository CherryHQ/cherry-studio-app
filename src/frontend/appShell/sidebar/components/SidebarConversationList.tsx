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
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
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
  useConversationSessionChildren,
  useConversationSessionPath,
  useConversationSource,
  useConversationSourceState,
  useConversationPreview,
  useConversationAgentStatus,
} from '@/frontend/appShell/conversation';
import { ContextMenuLink, type ContextMenuLinkItem } from '@/frontend/appShell/navigation';
import { conversationHref, useConversationTarget } from '@/frontend/appShell/navigation/chat';
import { AgentAvatar } from '@/frontend/components/Avatar';
import { ConversationStatus } from '@/frontend/components/ConversationStatus';
import { usePreference } from '@/frontend/data/hooks';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { appSidebar } from '@/frontend/utils/constants';

import { useSidebarActions } from '../context';
import { useSidebarPresence } from '../hooks/useSidebarPresence';
import { useSidebarSelection, useSidebarSelectionSnapshot } from '../SidebarSelectionProvider';
import { SidebarAgentIconSlot, SidebarRowContent, SIDEBAR_LEADING_SIZE } from './SidebarRowContent';
import {
  SidebarSessionBranchFrame,
  SidebarSessionBranchLeading,
  SidebarSessionBranchToggle,
  type SidebarSessionBranchAction,
  type SidebarSessionBranchAncestor,
  type SidebarSessionBranchPosition,
} from './SidebarSessionBranch';

type RegisterEndReached = (handler?: () => void) => void;
const noSessionPath: readonly ConversationSummary[] = [];
const noAncestorContinuations: readonly SidebarSessionBranchAncestor[] = [];
const statusLabelKeys = {
  running: 'session.status.running',
  'awaiting-approval': 'session.status.awaitingApproval',
  'awaiting-input': 'chat.question.waiting',
  failed: 'session.status.failed',
  unread: 'session.status.completed',
} as const satisfies Record<ConversationListStatus, string>;

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
  const status = useConversationAgentStatus(agent.ref, !expanded);
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
                accessibilityValue={
                  status
                    ? { text: t('session.status.group', { status: t(statusLabelKeys[status]) }) }
                    : undefined
                }
                onPress={() => onSelect({ kind: 'agent', agent })}
                testID={`share-agent-${agent.id}`}
              >
                {({ pressed }) => (
                  <SidebarAgentRowContent agent={agent} pressed={pressed} status={status} />
                )}
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
            accessibilityValue={
              status
                ? { text: t('session.status.group', { status: t(statusLabelKeys[status]) }) }
                : undefined
            }
            accessibilityState={{ expanded }}
            testID={`sidebar-agent-${agent.id}`}
            onPress={toggle}
          >
            {({ pressed }) => (
              <SidebarAgentRowContent agent={agent} pressed={pressed} status={status}>
                {/* The 12pt row inset plus half this slot matches a 44pt branch target's center. */}
                <View className="w-5 shrink-0 items-center">{disclosure}</View>
              </SidebarAgentRowContent>
            )}
          </Pressable>
        )}
      </View>
      {expanded ? (
        <SidebarSessions
          agentRef={agent.ref}
          agentId={agent.id}
          onSelect={onSelect}
          showLoading={showLoading}
        />
      ) : null}
    </View>
  );
}

function SidebarAgentRowContent({
  agent,
  children,
  pressed,
  status,
}: {
  agent: AgentSummary;
  children?: ReactNode;
  pressed: boolean;
  status?: ConversationListStatus;
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
      <SidebarSessionStatus status={status} />
      {children}
    </SidebarRowContent>
  );
}

type SidebarSessionsProps = {
  agentRef?: AgentRef;
  agentId?: string;
  onSelect?: SelectDestination;
  registerEndReachedHandler?: RegisterEndReached;
  showLoading: boolean;
};

function SidebarSessions(props: SidebarSessionsProps) {
  return props.onSelect ? (
    <SidebarSessionList {...props} />
  ) : (
    <SidebarCurrentSessionList {...props} />
  );
}

/** Drawer visibility and automatic path expansion stay out of the destination picker. */
function SidebarCurrentSessionList(props: SidebarSessionsProps) {
  const source = useConversationSource();
  const navigation = useConversationTarget(source.ref);
  const [isSessionTreeEnabled] = usePreference('ui.sidebar.session_tree_enabled');
  const visible = useSidebarPresence() !== 'closed';
  const path = useConversationSessionPath(
    visible && isSessionTreeEnabled ? navigation.sessionId : undefined,
  );
  return (
    <SidebarSessionList
      key={isSessionTreeEnabled ? 'tree' : 'flat'}
      {...props}
      activePath={path.items}
      visible={visible}
      isSessionTreeEnabled={isSessionTreeEnabled}
    />
  );
}

function includePathSession(
  sessions: readonly ConversationSummary[],
  session?: ConversationSummary,
) {
  return session && !sessions.some((item) => item.ref.sessionId === session.ref.sessionId)
    ? [...sessions, session]
    : sessions;
}

function SidebarSessionList({
  agentRef,
  agentId,
  activePath = noSessionPath,
  visible = true,
  isSessionTreeEnabled = true,
  onSelect,
  registerEndReachedHandler,
  showLoading,
}: {
  activePath?: readonly ConversationSummary[];
  visible?: boolean;
  isSessionTreeEnabled?: boolean;
} & SidebarSessionsProps) {
  const { t } = useTranslation();
  const source = useConversationSource();
  const navigation = useConversationTarget(source.ref);
  const query = useConversationSessions(agentRef, source.ref.kind !== 'desktop' || visible, {
    includeBranches: !isSessionTreeEnabled,
  });
  const [showAll, setShowAll] = useState(false);
  const [limit, setLimit] = useState<number>(appSidebar.recentSessionLimit);
  const leading = agentRef ? <SidebarAgentIconSlot /> : undefined;
  const { hasNextPage, isFetchingNextPage, fetchNextPage, items: sessions, isError } = query;
  const root = activePath[0];
  // The selected family's identity restores its path on navigation or drawer reopening.
  // Other expanded families keep their own state.
  const pathTarget = visible ? activePath.at(-1)?.ref.sessionId : undefined;
  const shownSessions = includePathSession(
    sessions.slice(0, limit),
    isSessionTreeEnabled && (!agentRef || root?.agentId === agentId) ? root : undefined,
  );
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
  if (query.isSuccess && !shownSessions.length)
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
          sessions={shownSessions}
          limit={shownSessions.length}
        />
      )}
      {shownSessions.map((session) =>
        isSessionTreeEnabled && session.hasChildren && source.catalog.listSessionChildren ? (
          <SidebarSessionTreeNode
            key={
              session.ref.sessionId === root?.ref.sessionId && pathTarget
                ? JSON.stringify([session.ref.sessionId, pathTarget])
                : session.ref.sessionId
            }
            session={session}
            leading={leading}
            onSelect={onSelect}
            activePath={activePath}
            visible={visible}
          />
        ) : onSelect ? (
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

type SidebarSessionTreeNodeProps = {
  session: ConversationSummary;
  leading?: ReactNode;
  onSelect?: SelectDestination;
  depth?: number;
  ancestorContinuations?: readonly SidebarSessionBranchAncestor[];
  hasFollowingSibling?: boolean;
  activePath: readonly ConversationSummary[];
  visible: boolean;
};

function SidebarSessionTreeNode({
  session,
  leading,
  onSelect,
  depth = 0,
  ancestorContinuations = noAncestorContinuations,
  hasFollowingSibling = false,
  activePath,
  visible,
}: SidebarSessionTreeNodeProps) {
  const source = useConversationSource();
  const navigation = useConversationTarget(source.ref);
  const canExpand = Boolean(session.hasChildren && source.catalog.listSessionChildren);
  const selectedId = activePath.at(-1)?.ref.sessionId;
  const onSelectedPath = activePath.some((item) => item.ref.sessionId === session.ref.sessionId);
  const [isExpanded, setExpanded] = useState(
    onSelectedPath && selectedId !== session.ref.sessionId,
  );
  const expanded = canExpand && isExpanded;
  const position: SidebarSessionBranchPosition = {
    kind: 'session',
    depth,
    ancestorContinuations,
    hasFollowingSibling,
    expanded,
    onSelectedPath,
  };
  const branch: SidebarSessionBranchAction | undefined = canExpand
    ? { expanded, toggle: () => setExpanded((value) => !value) }
    : undefined;
  const descendants = expanded ? (
    <SidebarSessionChildren
      parent={session}
      leading={leading}
      onSelect={onSelect}
      depth={depth + 1}
      ancestorContinuations={
        depth === 0
          ? noAncestorContinuations
          : [
              ...ancestorContinuations,
              { sessionId: session.ref.sessionId, continues: hasFollowingSibling },
            ]
      }
      activePath={activePath}
      visible={visible}
    />
  ) : null;
  return onSelect ? (
    <DestinationSessionRow
      session={session}
      leading={leading}
      onSelect={onSelect}
      position={position}
      branch={branch}
    >
      {descendants}
    </DestinationSessionRow>
  ) : (
    <SidebarSessionRow
      session={session}
      leading={leading}
      selectionKey={JSON.stringify([source.scope, session.ref.sessionId])}
      selected={session.ref.sessionId === navigation.sessionId}
      position={position}
      branch={branch}
    >
      {descendants}
    </SidebarSessionRow>
  );
}

function SidebarSessionChildren({
  parent,
  leading,
  onSelect,
  depth,
  ancestorContinuations,
  activePath,
  visible,
}: Omit<SidebarSessionTreeNodeProps, 'session' | 'hasFollowingSibling'> & {
  parent: ConversationSummary;
  depth: number;
  ancestorContinuations: readonly SidebarSessionBranchAncestor[];
}) {
  const { t } = useTranslation();
  const query = useConversationSessionChildren(parent.ref, visible);
  const sessions = includePathSession(
    query.items,
    activePath.find((item) => item.forkedFromSessionId === parent.ref.sessionId),
  );
  const rowLeading = <SidebarSessionBranchLeading leading={leading} depth={depth} />;
  const footer = query.isError ? (
    <LoadMore leading={rowLeading} label={t('common.retry')} onPress={() => void query.refetch()} />
  ) : query.hasNextPage ? (
    <LoadMore
      leading={rowLeading}
      disabled={query.isFetchingNextPage}
      onPress={() => void query.fetchNextPage()}
    />
  ) : query.isLoading ? (
    <SidebarRowContent leading={rowLeading}>
      <Text className="text-muted-foreground text-sm">{t('session.list.loading')}</Text>
    </SidebarRowContent>
  ) : null;
  return (
    <>
      {onSelect ? null : (
        <SidebarSessionSelectionRegistration
          listKey={`children:${parent.ref.sessionId}`}
          sessions={sessions}
          limit={sessions.length}
        />
      )}
      {sessions.map((session, index) => (
        <SidebarSessionTreeNode
          key={session.ref.sessionId}
          session={session}
          leading={leading}
          onSelect={onSelect}
          depth={depth}
          ancestorContinuations={ancestorContinuations}
          hasFollowingSibling={index < sessions.length - 1 || Boolean(footer)}
          activePath={activePath}
          visible={visible}
        />
      ))}
      {footer ? (
        <SidebarSessionBranchFrame
          position={{ kind: 'continuation', depth, ancestorContinuations }}
          leading={leading}
        >
          <View className="min-w-0 flex-1">{footer}</View>
        </SidebarSessionBranchFrame>
      ) : null}
    </>
  );
}

/** Drawer management stays out of the destination picker. */
function SidebarSessionSelectionRegistration({
  agentRef,
  listKey,
  limit,
  sessions,
}: {
  agentRef?: AgentRef;
  listKey?: string;
  limit: number;
  sessions: readonly ConversationSummary[];
}) {
  const source = useConversationSource();
  const { registerList } = useSidebarSelection();
  const key = `${source.scope}:${listKey ?? agentRef ?? ''}`;
  const unregister = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    unregister.current = registerList(key, source, sessions.slice(0, limit));
  }, [key, limit, registerList, sessions, source]);
  // Content updates retain selected survivors; only the registration owner unregisters its list.
  useEffect(() => () => unregister.current?.(), [key, registerList]);
  return null;
}

function DestinationSessionRow({
  leading,
  onSelect,
  session,
  position,
  branch,
  children,
}: {
  leading?: ReactNode;
  onSelect: SelectDestination;
  session: ConversationSummary;
  position?: SidebarSessionBranchPosition;
  branch?: SidebarSessionBranchAction;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const { status } = useConversationPreview(session.ref, {
    includeDescendants: branch?.expanded === false,
  });
  return (
    <>
      <SidebarSessionBranchFrame position={position} leading={leading}>
        <View className="min-w-0 flex-1">
          <Pressable
            accessibilityLabel={session.title || t('session.list.untitled')}
            accessibilityValue={
              status
                ? {
                    text:
                      branch?.expanded === false
                        ? t('session.status.group', { status: t(statusLabelKeys[status]) })
                        : t(statusLabelKeys[status]),
                  }
                : undefined
            }
            accessibilityRole="button"
            onPress={() => onSelect({ kind: 'session', session })}
            testID={`share-session-${session.ref.sessionId}`}
          >
            {({ pressed }) => (
              <SidebarRowContent
                trailingInset={branch ? 0 : undefined}
                leading={
                  position ? (
                    <SidebarSessionBranchLeading leading={leading} depth={position.depth} />
                  ) : (
                    leading
                  )
                }
                className={cn('w-full', pressed && 'bg-sidebar-accent')}
              >
                <SidebarSessionContent title={session.title} status={status} />
              </SidebarRowContent>
            )}
          </Pressable>
        </View>
        {branch ? (
          <SidebarSessionBranchToggle
            action={branch}
            title={session.title}
            sessionId={session.ref.sessionId}
          />
        ) : null}
      </SidebarSessionBranchFrame>
      {children}
    </>
  );
}

function SidebarSessionRow({
  session,
  selectionKey,
  leading,
  selected,
  position,
  branch,
  children,
}: {
  session: ConversationSummary;
  selectionKey: string;
  leading?: ReactNode;
  selected: boolean;
  position?: SidebarSessionBranchPosition;
  branch?: SidebarSessionBranchAction;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const { closeDrawer } = useSidebarActions('Sidebar session');
  const { rename, remove, status } = useConversationPreview(session.ref, {
    includeDescendants: branch?.expanded === false,
  });
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
      accessibilityValue={
        status
          ? {
              text:
                branch?.expanded === false
                  ? t('session.status.group', { status: t(statusLabelKeys[status]) })
                  : t(statusLabelKeys[status]),
            }
          : undefined
      }
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
          trailingInset={branch ? 0 : undefined}
          leading={
            position ? (
              <SidebarSessionBranchLeading leading={leading} depth={position.depth} />
            ) : (
              leading
            )
          }
          className={cn('w-full', pressed && 'bg-sidebar-accent')}
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
    <>
      <Animated.View layout={rowLayout} exiting={rowExit}>
        <SidebarSessionBranchFrame
          position={position}
          leading={leading}
          selected={!isSelecting && selected}
        >
          <View className="min-w-0 flex-1">
            {isSelecting ? (
              row
            ) : (
              <ContextMenuLink href={conversationHref(session.ref)} items={isDeleting ? [] : menu}>
                {row}
              </ContextMenuLink>
            )}
          </View>
          {branch ? (
            <SidebarSessionBranchToggle
              action={branch}
              title={session.title}
              sessionId={session.ref.sessionId}
              disabled={isDeleting}
            />
          ) : null}
        </SidebarSessionBranchFrame>
      </Animated.View>
      {children}
    </>
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
  const color = useThemeColor('muted-foreground');
  if (status === 'awaiting-approval' || status === 'awaiting-input')
    return (
      <View className="shrink-0">
        <Text className="font-medium text-warning text-xs" numberOfLines={1}>
          {t(
            status === 'awaiting-input'
              ? 'session.status.awaitingInputShort'
              : 'session.status.awaitingApprovalShort',
          )}
        </Text>
      </View>
    );
  if (!status) return null;
  return (
    <View className="shrink-0">
      {status === 'running' ? (
        <Spinner accessible={false} color={color} size="sm" />
      ) : status === 'failed' ? (
        <CircleAlertIcon accessible={false} className="size-4 text-error" />
      ) : (
        <View className="size-1.5 rounded-full bg-success" />
      )}
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
