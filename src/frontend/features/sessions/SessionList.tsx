import BotIcon from '@cherrystudio/app-icons/icons/bot';
import CheckIcon from '@cherrystudio/app-icons/icons/check';
import MessageCircleMoreIcon from '@cherrystudio/app-icons/icons/message-circle-more';
import { ContentState, ContextMenuScrollBoundary } from '@cherrystudio/ui/components';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { type AccessibilityActionEvent, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import Animated, { FadeInLeft, FadeOutLeft } from 'react-native-reanimated';

import { ContextMenuLink, type ContextMenuLinkItem } from '@/frontend/components/navigation';
import { chatHref } from '@/frontend/components/navigation/chat';
import {
  useListBottomInset,
  usePendingDeletionIds,
  useRegisterSelectionSource,
  useSelectionActions,
  useSelectionState,
} from '@/frontend/components/selection';
import { useAgentsApi } from '@/frontend/hooks/agent';
import type { AgentSessionEntity } from '@/shared/data/api/schemas/agentSessions';

import { useSessionActionAlerts } from './components/useSessionActionAlerts';
import {
  SessionListProvider,
  useSessionListActions,
  useSessionListSessions,
} from './context/SessionListProvider';
import { useSessionListInitialData } from './hooks/useSessionListInitialData';
import {
  sessionSelectionScope,
  useSessionSelectionSource,
} from './hooks/useSessionSelectionSource';

type SessionRowProps = {
  agentName?: string;
  isEditing: boolean;
  isSelected: boolean;
  onDelete: (session: AgentSessionEntity) => void;
  onRename: (session: AgentSessionEntity) => void;
  onToggle: (sessionId: string) => void;
  session: AgentSessionEntity;
};

const SESSION_ITEM_ESTIMATED_HEIGHT = 60;
const EDITING_ACCESSIBILITY_ACTIONS = [{ name: 'activate' }] as const;

function sessionKeyExtractor(item: AgentSessionEntity) {
  return item.id;
}

function isSameCalendarDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatSessionActivityAt(
  lastActivityAt: string,
  locale: string | undefined,
  yesterday: string,
) {
  const activityDate = new Date(lastActivityAt);
  const today = new Date();
  const yesterdayDate = new Date(today);
  yesterdayDate.setDate(today.getDate() - 1);

  const time = activityDate.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isSameCalendarDay(activityDate, today)) {
    return time;
  }

  if (isSameCalendarDay(activityDate, yesterdayDate)) {
    return `${yesterday} ${time}`;
  }

  return activityDate.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'numeric',
    ...(activityDate.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
  });
}

const SessionListView = memo(function SessionListView() {
  const { t } = useTranslation();
  const bottomInset = useListBottomInset();
  const { isSessionListLoading, sessionQueryError, sessions } = useSessionListSessions();
  const { loadMoreSessions } = useSessionListActions();
  const { agents, error: agentsQueryError, isLoading: isAgentsLoading } = useAgentsApi();
  const isInitialDataSettled = useSessionListInitialData({
    agents: { error: agentsQueryError, isLoading: isAgentsLoading },
    sessions: { error: sessionQueryError, isLoading: isSessionListLoading },
  });
  const initialLoadError = sessionQueryError ?? agentsQueryError;
  const { toggleId } = useSelectionActions();
  const { isEditing, selectedIds } = useSelectionState();
  const pendingDeletionIds = usePendingDeletionIds(sessionSelectionScope);
  const selectionSource = useSessionSelectionSource();
  useRegisterSelectionSource(sessionSelectionScope, selectionSource);
  const { requestDelete, requestRename } = useSessionActionAlerts();
  // Bottom inset is stable across the edit⇄done flip (see useListBottomInset),
  // so this style reference stays put and the list never reflows on toggle.
  const contentContainerStyle = useMemo(
    () => ({ paddingBottom: bottomInset, paddingHorizontal: 8 }),
    [bottomInset],
  );
  const visibleSessions = useMemo(
    () =>
      pendingDeletionIds.size === 0
        ? sessions
        : sessions.filter((session) => !pendingDeletionIds.has(session.id)),
    [pendingDeletionIds, sessions],
  );
  const listExtraData = useMemo(() => ({ isEditing, selectedIds }), [isEditing, selectedIds]);
  // Soft-deleted agents leave the list response, so their sessions fall back
  // to the "deleted agent" label instead of an unresolved name.
  const agentNamesById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent.name])),
    [agents],
  );

  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<AgentSessionEntity>) => (
      <SessionRow
        agentName={agentNamesById.get(item.agentId)}
        isEditing={isEditing}
        isSelected={selectedIds.has(item.id)}
        onDelete={requestDelete}
        onRename={requestRename}
        onToggle={toggleId}
        session={item}
      />
    ),
    [agentNamesById, isEditing, requestDelete, requestRename, selectedIds, toggleId],
  );

  // Loading stays inside ListEmptyComponent so the list mounts on the first
  // frame: a loading-gate sibling tree would mount the scroll view only after
  // the push settles, and `automatic` would resolve a zero top inset under the
  // transparent header.
  const listEmptyComponent = useCallback(
    () =>
      isInitialDataSettled ? (
        initialLoadError ? (
          <ContentState.Error className="px-6 py-8" title={t('session.list.loadFailed')} />
        ) : (
          <ContentState.Empty
            description={t('session.list.emptyDescription')}
            icon={
              <ContentState.Icon>
                <MessageCircleMoreIcon className="size-7 text-foreground" />
              </ContentState.Icon>
            }
            layout="page"
            title={t('session.list.empty')}
          />
        )
      ) : (
        <ContentState.Loading className="px-6 py-8" />
      ),
    [initialLoadError, isInitialDataSettled, t],
  );

  return (
    <View className="flex-1">
      <ContextMenuScrollBoundary>
        {(scrollHandlers) => (
          <LegendList
            {...scrollHandlers}
            className="flex-1 bg-background"
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={contentContainerStyle}
            data={isInitialDataSettled && !initialLoadError ? visibleSessions : []}
            estimatedItemSize={SESSION_ITEM_ESTIMATED_HEIGHT}
            extraData={listExtraData}
            keyExtractor={sessionKeyExtractor}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={listEmptyComponent}
            onEndReached={loadMoreSessions}
            onEndReachedThreshold={0.7}
            recycleItems
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
          />
        )}
      </ContextMenuScrollBoundary>
    </View>
  );
});

// The list owns its data provider so hosts (the session management screen, or
// anything else embedding the list) never touch session state directly.
export function SessionList({ agentId }: { agentId?: string }) {
  return (
    <SessionListProvider agentId={agentId}>
      <SessionListView />
    </SessionListProvider>
  );
}

export const SessionRow = memo(function SessionRow({
  agentName,
  isEditing,
  isSelected,
  onDelete,
  onRename,
  onToggle,
  session,
}: SessionRowProps) {
  const { i18n, t } = useTranslation();
  const activityLabel = formatSessionActivityAt(
    session.lastActivityAt,
    i18n.resolvedLanguage,
    t('session.activityAt.yesterday'),
  );

  const handleRenamePress = useCallback(() => {
    onRename(session);
  }, [onRename, session]);
  const handleDeletePress = useCallback(() => {
    onDelete(session);
  }, [onDelete, session]);
  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === 'activate') {
        onToggle(session.id);
      }
    },
    [onToggle, session.id],
  );
  const href = useMemo(() => chatHref({ kind: 'session', sessionId: session.id }), [session.id]);
  const menuItems = useMemo<readonly ContextMenuLinkItem[]>(
    () => [
      {
        id: 'rename',
        label: t('common.rename'),
        onPress: handleRenamePress,
      },
      {
        id: 'delete',
        label: t('common.delete'),
        onPress: handleDeletePress,
        destructive: true,
      },
    ],
    [handleDeletePress, handleRenamePress, t],
  );

  const row = (
    <Pressable
      accessibilityActions={isEditing ? EDITING_ACCESSIBILITY_ACTIONS : undefined}
      accessibilityLabel={session.title || t('session.list.untitled')}
      accessibilityRole={isEditing ? 'checkbox' : 'link'}
      accessibilityState={isEditing ? { checked: isSelected } : undefined}
      className="w-full active:bg-secondary"
      onAccessibilityAction={isEditing ? handleAccessibilityAction : undefined}
      onPress={isEditing ? () => onToggle(session.id) : undefined}
    >
      <View className="relative min-w-0 flex-1 flex-row items-center gap-2 border-border border-b bg-transparent py-2 pl-2">
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
        <View className="ml-1 size-10 items-center justify-center rounded-full bg-secondary">
          <BotIcon className="size-5 text-foreground" />
        </View>
        <View className="min-w-0 flex-1 pr-4">
          <View className="gap-0.5">
            <View className="min-w-0 flex-row items-center gap-2">
              <Text
                className="min-w-0 flex-1 font-semibold text-foreground text-base"
                numberOfLines={1}
              >
                {session.title || t('session.list.untitled')}
              </Text>
              <Text className="text-foreground-tertiary text-xs" numberOfLines={1}>
                {activityLabel}
              </Text>
            </View>
            <Text className="text-foreground-tertiary text-xs" numberOfLines={1}>
              {agentName ?? t('session.list.deletedAgent')}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );

  return isEditing ? (
    row
  ) : (
    <ContextMenuLink href={href} items={menuItems}>
      {row}
    </ContextMenuLink>
  );
});
