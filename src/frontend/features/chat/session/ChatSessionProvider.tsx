import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'expo-router';
import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import { queryKeys, useBackendModule } from '@/frontend/data';
import { getMessagesQueryKey } from '@/frontend/hooks/chat/utils/messageQueryOptions';
import type {
  ChatSendNewTopicTextInput,
  ChatSession,
  ChatSessionTopicSnapshot,
} from '@/shared/contracts';
import { NEW_CHAT_SESSION_TOPIC_ID } from '@/shared/contracts';

type ChatSessionContextValue = {
  session: ChatSession;
};

type ChatSessionTopicValue = ChatSessionTopicSnapshot & {
  abort: () => void;
  isBusy: boolean;
  sendText: (input: ChatSendNewTopicTextInput) => Promise<void>;
};

const ChatSessionContext = createContext<ChatSessionContextValue | null>(null);

export function ChatSessionProvider({ children }: PropsWithChildren) {
  const chat = useBackendModule('chat');
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const router = useRouter();
  const [navigation] = useState(() => createChatSessionNavigation({ pathname, router }));
  const [session] = useState(() => chat.createSession());
  const contextValue = useMemo(() => ({ session }), [session]);

  useEffect(() => {
    navigation.update({ pathname, router });
  }, [navigation, pathname, router]);
  useEffect(
    () =>
      session.subscribe(async (event) => {
        switch (event.type) {
          case 'invalidate-topic-messages':
            await queryClient.invalidateQueries({ queryKey: getMessagesQueryKey(event.topicId) });
            break;
          case 'invalidate-topics':
            await queryClient.invalidateQueries({ queryKey: queryKeys.topics.all() });
            break;
          case 'open-topic':
            navigation.openTopic(event.topicId);
            break;
          case 'snapshot-changed':
            break;
        }
      }),
    [navigation, queryClient, session],
  );
  useEffect(() => () => session.dispose(), [session]);

  return <ChatSessionContext value={contextValue}>{children}</ChatSessionContext>;
}

function createChatSessionNavigation(input: {
  pathname: string;
  router: ReturnType<typeof useRouter>;
}) {
  let navigation = input;

  return {
    openTopic: (topicId: string) => {
      if (navigation.pathname === '/topics') {
        navigation.router.setParams({ topicId });
        return;
      }

      navigation.router.replace({
        params: { topicId },
        pathname: '/topics',
      });
    },
    update: (nextNavigation: typeof input) => {
      navigation = nextNavigation;
    },
  };
}

export function useChatSession() {
  const context = use(ChatSessionContext);

  if (!context) {
    throw new Error('useChatSession must be used within ChatSessionProvider');
  }

  return context.session;
}

export function useChatSessionTopic(topicId?: string): ChatSessionTopicValue {
  const session = useChatSession();
  const sessionTopicId = topicId ?? NEW_CHAT_SESSION_TOPIC_ID;
  const subscribe = useCallback(
    (listener: () => void) =>
      session.subscribe((event) => {
        if (event.type === 'snapshot-changed') {
          listener();
        }
      }),
    [session],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    () => session.getTopicSnapshot(sessionTopicId),
    () => session.getTopicSnapshot(sessionTopicId),
  );
  const abort = useCallback(() => session.abort(sessionTopicId), [session, sessionTopicId]);
  const sendText = useCallback(
    (input: ChatSendNewTopicTextInput) => {
      if (!topicId) {
        return session.sendNewTopicText(input);
      }

      return session.sendText({ ...input, topicId });
    },
    [session, topicId],
  );
  const isBusy =
    snapshot.status === 'aborting' ||
    snapshot.status === 'reserving' ||
    snapshot.status === 'streaming';

  return {
    ...snapshot,
    abort,
    isBusy,
    sendText,
  };
}
