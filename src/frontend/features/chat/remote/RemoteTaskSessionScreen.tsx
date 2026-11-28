import { ContentState } from '@cherrystudio/ui/components';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ConversationSourceBoundary } from '@/frontend/appShell/conversation';
import {
  useConversation,
  useRemoteConversationSource,
} from '@/frontend/appShell/conversation/remote';
import { MainHeaderView } from '@/frontend/appShell/header';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

import { ChatScreenFrame } from '../components/ChatScreenFrame';
import { RemoteChatSession } from './RemoteChatScreen';

export function RemoteTaskSessionScreen() {
  const params = useLocalSearchParams();
  const connectionId = getSingleRouteParam(params.connectionId);
  const taskId = getSingleRouteParam(params.taskId);
  const sessionId = getSingleRouteParam(params.sessionId);
  return connectionId && taskId && sessionId ? (
    <ConversationSourceBoundary
      source={{ kind: 'desktop', connectionId }}
      fallback={renderUnavailable}
    >
      <TaskSession connectionId={connectionId} taskId={taskId} sessionId={sessionId} />
    </ConversationSourceBoundary>
  ) : (
    renderUnavailable('error')
  );
}

function renderUnavailable(state: 'loading' | 'error') {
  return <TaskSessionStatus state={state} />;
}

function TaskSessionStatus({ state, retry }: { state: 'loading' | 'error'; retry?(): void }) {
  const { t } = useTranslation();
  return (
    <ChatScreenFrame header={MainHeaderView}>
      <View className="flex-1 justify-center px-8 py-16">
        {state === 'loading' ? (
          <ContentState.Loading title={t('chat.history.loading')} />
        ) : (
          <ContentState.Error
            title={t(retry ? 'chat.history.loadFailed' : 'remoteAgent.loadFailed')}
            primaryAction={{
              children: t(retry ? 'common.retry' : 'settings.deviceConnections.title'),
              onPress: retry ?? (() => router.push('/settings/device-connections')),
            }}
          />
        )}
      </View>
    </ChatScreenFrame>
  );
}

function TaskSession({
  connectionId,
  taskId,
  sessionId,
}: {
  connectionId: string;
  taskId: string;
  sessionId: string;
}) {
  const source = useRemoteConversationSource();
  const opened = useConversation({ source: source.ref, sessionId }, source, taskId);
  if (!opened.session)
    return <TaskSessionStatus state={opened.error ? 'error' : 'loading'} retry={opened.retry} />;
  return <RemoteChatSession target={{ connectionId, sessionId }} opened={opened} />;
}
