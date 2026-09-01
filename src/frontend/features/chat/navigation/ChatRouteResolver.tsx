import { ContentState } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { type ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { MainHeader } from '@/frontend/components/headers';
import { chatRouteParams, parseStoredChatTarget } from '@/frontend/components/navigation/chat';
import { resolveChatRestoreState } from '@/frontend/components/navigation/chat/chatRestore';
import { usePreference } from '@/frontend/data/hooks';
import { useAgentSession, useAgentsApi, useLatestAgentSession } from '@/frontend/hooks/agent';
import { DataApiError, ErrorCode } from '@/shared/data/api/errors';

import { ChatEmptyState } from '../workspace';

type ChatRouteResolverProps = {
  requestedSessionId?: string;
};

export function ChatRouteResolver({ requestedSessionId }: ChatRouteResolverProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [storedTargetValue] = usePreference('chat.last_active_target');
  const storedTarget = parseStoredChatTarget(storedTargetValue);
  const requestedSession = useAgentSession(requestedSessionId);
  const storedSessionId =
    storedTarget?.kind === 'session' && storedTarget.sessionId !== requestedSessionId
      ? storedTarget.sessionId
      : undefined;
  const storedSession = useAgentSession(storedSessionId);
  const latestSession = useLatestAgentSession();
  const agents = useAgentsApi();
  const restoreState = resolveChatRestoreState({
    agents: { error: agents.error, isLoading: agents.isLoading, items: agents.agents },
    latestSession,
    requestedSession: {
      ...requestedSession,
      isNotFound: isNotFoundError(requestedSession.error),
      sessionId: requestedSessionId,
    },
    storedSession: {
      ...storedSession,
      isNotFound: isNotFoundError(storedSession.error),
      sessionId: storedSessionId,
    },
    storedTarget,
  });

  useEffect(() => {
    if (restoreState.status !== 'ready') {
      return;
    }

    router.setParams(chatRouteParams(restoreState.target));
  }, [restoreState, router]);

  if (restoreState.status === 'loading' || restoreState.status === 'ready') {
    return (
      <ChatRouteResolverLayout>
        <ContentState.Loading title={t('session.list.loading')} />
      </ChatRouteResolverLayout>
    );
  }

  if (restoreState.status === 'error') {
    return (
      <ChatRouteResolverLayout>
        <ContentState.Error
          className="px-8"
          primaryAction={{
            children: t('agent.actions.retry'),
            onPress: () => {
              const requests: Promise<unknown>[] = [latestSession.refetch(), agents.refetch()];
              if (requestedSessionId) {
                requests.push(requestedSession.refetch());
              }
              if (storedSessionId) {
                requests.push(storedSession.refetch());
              }
              void Promise.all(requests);
            },
          }}
          title={t('navigation.chatsLoadFailed')}
        />
      </ChatRouteResolverLayout>
    );
  }

  return (
    <ChatRouteResolverLayout>
      <ChatEmptyState contentBottomInset={12} />
    </ChatRouteResolverLayout>
  );
}

function ChatRouteResolverLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MainHeader />
      <View className="flex-1 bg-background">{children}</View>
    </>
  );
}

function isNotFoundError(error: Error | undefined) {
  return error instanceof DataApiError && error.code === ErrorCode.NOT_FOUND;
}
