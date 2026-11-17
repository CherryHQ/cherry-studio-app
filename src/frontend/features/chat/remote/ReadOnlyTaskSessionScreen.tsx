import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ConversationSourceBoundary,
  useConversationAgents,
} from '@/frontend/appShell/conversation';
import {
  useConversation,
  useConversationSnapshot,
  useRemoteConversationSource,
} from '@/frontend/appShell/conversation/remote';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

import { ReadOnlyRemoteChat } from './ReadOnlyRemoteChat';

export function ReadOnlyTaskSessionScreen() {
  const params = useLocalSearchParams();
  const connectionId = getSingleRouteParam(params.connectionId);
  const taskId = getSingleRouteParam(params.taskId);
  const sessionId = getSingleRouteParam(params.sessionId);
  return connectionId && taskId && sessionId ? (
    <ConversationSourceBoundary
      source={{ kind: 'desktop', connectionId }}
      fallback={renderUnavailable}
    >
      <TaskSession taskId={taskId} sessionId={sessionId} />
    </ConversationSourceBoundary>
  ) : (
    <SourceUnavailable state="error" />
  );
}

const unavailable = new Error('Desktop source unavailable');
function renderUnavailable(state: 'loading' | 'error') {
  return <SourceUnavailable state={state} />;
}

function SourceUnavailable({ state }: { state: 'loading' | 'error' }) {
  const { t } = useTranslation();
  return (
    <ReadOnlyRemoteChat
      isLoading={state === 'loading'}
      error={state === 'error' ? unavailable : undefined}
      errorTitle={t('remoteAgent.loadFailed')}
      retryLabel={t('settings.deviceConnections.title')}
      onRetry={() => router.push('/settings/device-connections')}
    />
  );
}

function TaskSession({ taskId, sessionId }: { taskId: string; sessionId: string }) {
  const source = useRemoteConversationSource();
  const opened = useConversation({ source: source.ref, sessionId }, source, taskId);
  const snapshot = useConversationSnapshot(opened.session);
  const agents = useConversationAgents();
  const agent = agents.items.find((agent) => agent.id === snapshot.agentId);
  useEffect(() => {
    if (
      snapshot.agentId &&
      !agent &&
      agents.hasNextPage &&
      !agents.isFetchingNextPage &&
      !agents.isError
    )
      void agents.fetchNextPage();
  }, [snapshot.agentId, agent, agents]);
  return (
    <ReadOnlyRemoteChat
      session={opened.session}
      agent={agent}
      error={opened.error}
      isLoading={opened.isLoading}
      onRetry={opened.retry}
    />
  );
}
