import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import ClockIcon from '@cherrystudio/app-icons/icons/clock';
import { Button, ContentState, ScrollInteractionBoundary } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import { Link, router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ConversationReadError,
  useConversationAgents,
  useConversationSource,
  useConversationSourceState,
} from '@/frontend/appShell/conversation';
import { useRemoteTaskSessions, useRemoteTasks } from '@/frontend/appShell/conversation/remote';
import { RouteHeader } from '@/frontend/appShell/header';
import { ConversationStatus } from '@/frontend/components/ConversationStatus';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import type { RemoteTaskView } from '@/shared/contracts/remoteAgent';

import { RemoteTaskBoundary } from './RemoteTaskBoundary';
import { taskSchedule } from './taskSchedule';

export function RemoteTaskListScreen() {
  const connectionId = getSingleRouteParam(useLocalSearchParams().connectionId);
  return (
    <RemoteTaskBoundary connectionId={connectionId}>
      <TaskList connectionId={connectionId!} />
    </RemoteTaskBoundary>
  );
}

function TaskList({ connectionId }: { connectionId: string }) {
  const focused = useIsFocused();
  const { t, i18n } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const { availability } = useConversationSourceState();
  const source = useConversationSource();
  const tasks = useRemoteTasks(focused);
  const [selected, setSelected] = useState<{ taskId: string; sessionId: string }>();
  const agents = useConversationAgents(focused);
  const missingAgent = tasks.items.some(
    (task) => !agents.items.some((agent) => agent.id === task.agentId),
  );
  useEffect(() => {
    if (
      focused &&
      missingAgent &&
      agents.hasNextPage &&
      !agents.isFetchingNextPage &&
      !agents.isError
    )
      void agents.fetchNextPage();
  }, [focused, missingAgent, agents]);
  const language = i18n.resolvedLanguage ?? i18n.language;
  const dates = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [language],
  );
  const unsupported =
    tasks.error instanceof ConversationReadError && tasks.error.failure.code === 'upgrade-required';
  return (
    <>
      <RouteHeader title={t('remoteTasks.title')} />
      <ScrollInteractionBoundary>
        {(handlers) => (
          <ScrollView
            {...handlers}
            className="flex-1 bg-background"
            contentContainerStyle={{ paddingTop: 8, paddingBottom: bottom + 24 }}
            contentInsetAdjustmentBehavior="automatic"
            showsVerticalScrollIndicator={false}
          >
            <ConversationStatus
              availability={availability}
              onRepair={() => router.push('/settings/device-connections')}
            />
            {tasks.isLoading ? (
              <View className="px-8 py-16">
                <ContentState.Loading title={t('remoteTasks.loading')} />
              </View>
            ) : null}
            {tasks.isError && !tasks.data ? (
              <View className="px-8 py-16">
                <ContentState.Error
                  title={t('remoteTasks.loadFailed')}
                  description={unsupported ? t('remoteTasks.upgradeRequired') : undefined}
                  primaryAction={{
                    children: t('common.retry'),
                    onPress: () => void tasks.refetch(),
                  }}
                />
              </View>
            ) : null}
            {tasks.isSuccess && !tasks.items.length && !tasks.hasNextPage ? (
              <View className="px-8 py-16">
                <ContentState.Empty
                  title={t('remoteTasks.emptyTitle')}
                  description={t('remoteTasks.emptyDescription')}
                />
              </View>
            ) : null}
            <View key={source.scope} className="gap-2 px-2">
              {tasks.items.map((task) => (
                <TaskGroup
                  key={task.id}
                  task={task}
                  connectionId={connectionId}
                  agentName={
                    agents.items.find((agent) => agent.id === task.agentId)?.name ??
                    t('remoteTasks.agent')
                  }
                  schedule={taskSchedule(task.trigger, language, t)}
                  dates={dates}
                  focused={focused}
                  selectedSession={selected?.taskId === task.id ? selected.sessionId : undefined}
                  onSelect={(sessionId) => setSelected({ taskId: task.id, sessionId })}
                />
              ))}
            </View>
            {tasks.isError && tasks.data ? (
              <Button variant="ghost" onPress={() => void tasks.refetch()}>
                {t('common.retry')}
              </Button>
            ) : tasks.hasNextPage ? (
              <Button
                variant="ghost"
                loading={tasks.isFetchingNextPage}
                onPress={() => void tasks.fetchNextPage()}
              >
                {t('remoteTasks.loadMore')}
              </Button>
            ) : null}
          </ScrollView>
        )}
      </ScrollInteractionBoundary>
    </>
  );
}

function TaskGroup({
  task,
  connectionId,
  agentName,
  schedule,
  dates,
  focused,
  selectedSession,
  onSelect,
}: {
  task: RemoteTaskView;
  connectionId: string;
  agentName: string;
  schedule: string;
  dates: Intl.DateTimeFormat;
  focused: boolean;
  selectedSession?: string;
  onSelect(sessionId: string): void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const sessions = useRemoteTaskSessions(task.id, expanded && focused);
  const ChevronIcon = expanded ? ChevronDownIcon : ChevronRightIcon;
  return (
    <View testID={`remote-task-${task.id}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={task.name || t('remoteTasks.untitled')}
        accessibilityHint={t('remoteTasks.subtitle', { agent: agentName, schedule })}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        testID={`remote-task-toggle-${task.id}`}
      >
        {({ pressed }) => (
          <View
            className={cn(
              'flex-row items-center gap-3 rounded-xl px-3 py-2.5',
              pressed && 'bg-secondary',
            )}
          >
            <View className="w-7 items-center">
              <ClockIcon className="size-[19px] text-foreground" />
            </View>
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="font-medium text-base text-foreground" numberOfLines={1}>
                {task.name || t('remoteTasks.untitled')}
              </Text>
              <Text className="text-muted-foreground text-xs" numberOfLines={1}>
                {t('remoteTasks.subtitle', { agent: agentName, schedule })}
              </Text>
            </View>
            <ChevronIcon className="size-4 text-muted-foreground" />
          </View>
        )}
      </Pressable>
      {expanded ? (
        <View>
          {sessions.isLoading ? (
            <View className="py-4 pl-[52px]">
              <ContentState.Loading title={t('session.list.loading')} />
            </View>
          ) : null}
          {sessions.isError && !sessions.data ? (
            <View className="py-4 pl-[52px]">
              <ContentState.Error
                title={t('session.list.loadFailed')}
                primaryAction={{
                  children: t('common.retry'),
                  onPress: () => void sessions.refetch(),
                }}
              />
            </View>
          ) : null}
          {sessions.isSuccess && !sessions.items.length && !sessions.hasNextPage ? (
            <Text className="py-4 pl-[52px] text-muted-foreground text-sm">
              {t('remoteTasks.noSessions')}
            </Text>
          ) : null}
          {sessions.items.map((session) => (
            <Link
              key={session.ref.sessionId}
              asChild
              href={{
                pathname: '/scheduled-tasks/[connectionId]/[taskId]/[sessionId]',
                params: { connectionId, taskId: task.id, sessionId: session.ref.sessionId },
              }}
            >
              <Pressable
                accessibilityRole="link"
                accessibilityHint={t('remoteTasks.openSession')}
                accessibilityState={{ selected: selectedSession === session.ref.sessionId }}
                onPress={() => onSelect(session.ref.sessionId)}
                testID={`remote-task-session-${session.ref.sessionId}`}
              >
                {({ pressed }) => (
                  <View
                    className={cn(
                      'flex-row items-center gap-3 rounded-xl px-3 py-2.5',
                      (pressed || selectedSession === session.ref.sessionId) && 'bg-secondary',
                    )}
                  >
                    <View className="w-7" />
                    <Text className="min-w-0 flex-1 text-base text-foreground" numberOfLines={1}>
                      {session.title || t('session.list.untitled')}
                    </Text>
                    {session.updatedAt ? (
                      <Text className="text-muted-foreground text-xs">
                        {dates.format(new Date(session.updatedAt))}
                      </Text>
                    ) : null}
                  </View>
                )}
              </Pressable>
            </Link>
          ))}
          {sessions.isError && sessions.data ? (
            <Button variant="ghost" onPress={() => void sessions.refetch()}>
              {t('common.retry')}
            </Button>
          ) : sessions.hasNextPage ? (
            <Button
              variant="ghost"
              loading={sessions.isFetchingNextPage}
              onPress={() => void sessions.fetchNextPage()}
            >
              {t('remoteTasks.loadMore')}
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
