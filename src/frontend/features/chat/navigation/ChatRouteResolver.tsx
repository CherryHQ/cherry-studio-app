import { ContentState } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { type ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { MainHeader } from '@/frontend/components/headers';
import { chatRouteParams } from '@/frontend/components/navigation/chat';
import { resolveChatRestoreState } from '@/frontend/components/navigation/chat/chatRestore';
import { useAgentsApi, useLatestAgentSession } from '@/frontend/hooks/agent';

import { ChatEmptyState } from '../workspace';

export function ChatRouteResolver() {
  const { t } = useTranslation();
  const router = useRouter();
  const latestSession = useLatestAgentSession();
  const isLatestSessionLoading = latestSession.isLoading || latestSession.isRefreshing;
  const shouldLoadAgentFallback =
    !isLatestSessionLoading && !latestSession.error && !latestSession.session;
  const agents = useAgentsApi({ enabled: shouldLoadAgentFallback });
  const restoreState = resolveChatRestoreState({
    agents: { error: agents.error, isLoading: agents.isLoading, items: agents.agents },
    latestSession: {
      ...latestSession,
      isLoading: isLatestSessionLoading,
    },
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
              const requests: Promise<unknown>[] = [latestSession.refetch()];
              if (shouldLoadAgentFallback) {
                requests.push(agents.refetch());
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
