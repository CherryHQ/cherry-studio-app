import { ContentState } from '@cherrystudio/ui/components';
import { useNavigation } from 'expo-router';
import { type ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { chatRouteParams } from '@/frontend/appShell/navigation/chat';
import { resolveChatRestoreState } from '@/frontend/appShell/navigation/chat/chatRestore';
import { useAgentsApi } from '@/frontend/hooks/agent';

import { ChatEmptyState } from '../ChatWorkspace';

export function ChatRouteResolver() {
  const { t } = useTranslation();
  // Screen-scoped rather than `router.setParams`: the root router drops actions until the stack
  // registers in an effect, which runs after this one when the agents are already cached, as
  // when the account gate opens over a mounted app.
  const navigation = useNavigation<{
    setParams(params: ReturnType<typeof chatRouteParams>): void;
  }>();
  const agents = useAgentsApi();
  const restoreState = resolveChatRestoreState({
    agents: { error: agents.error, isLoading: agents.isLoading, items: agents.agents },
  });

  useEffect(() => {
    if (restoreState.status !== 'ready') {
      return;
    }

    navigation.setParams(chatRouteParams(restoreState.target));
  }, [restoreState, navigation]);

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
        <View className="px-8">
          <ContentState.Error
            primaryAction={{
              children: t('agent.actions.retry'),
              onPress: () => void agents.refetch(),
            }}
            title={t('navigation.chatsLoadFailed')}
          />
        </View>
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
  return <View className="flex-1 justify-center">{children}</View>;
}
