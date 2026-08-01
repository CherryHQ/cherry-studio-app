import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'expo-router';
import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';

import { queryKeys, useBackendModule } from '@/frontend/data';
import { getMessagesQueryKey } from '@/frontend/hooks/chat/utils/messageQueryOptions';
import type { ChatModule, ChatSendNewTopicTextInput, ChatTopicSnapshot } from '@/shared/contracts';
import { NEW_TOPIC_SNAPSHOT_KEY } from '@/shared/contracts';

type ChatTopicValue = ChatTopicSnapshot & {
  abort: () => void;
  isBusy: boolean;
  sendText: (input: ChatSendNewTopicTextInput) => Promise<void>;
};

const ChatContext = createContext<ChatModule | null>(null);

export function ChatProvider({ children }: PropsWithChildren) {
  const chat = useBackendModule('chat');
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const router = useRouter();
  const [navigation] = useState(() => createChatNavigation({ pathname, router }));

  useEffect(() => {
    navigation.update({ pathname, router });
  }, [navigation, pathname, router]);
  useEffect(
    () =>
      chat.subscribe(async (event) => {
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
    [chat, navigation, queryClient],
  );

  return <ChatContext value={chat}>{children}</ChatContext>;
}

function createChatNavigation(input: { pathname: string; router: ReturnType<typeof useRouter> }) {
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

export function useChat() {
  const context = use(ChatContext);

  if (!context) {
    throw new Error('useChat must be used within ChatProvider');
  }

  return context;
}

export function useChatTopic(topicId?: string): ChatTopicValue {
  const chat = useChat();
  const runtimeTopicId = topicId ?? NEW_TOPIC_SNAPSHOT_KEY;
  const subscribe = useCallback(
    (listener: () => void) =>
      chat.subscribe((event) => {
        if (event.type === 'snapshot-changed' && event.topicId === runtimeTopicId) {
          listener();
        }
      }),
    [chat, runtimeTopicId],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    () => chat.getTopicSnapshot(runtimeTopicId),
    () => chat.getTopicSnapshot(runtimeTopicId),
  );
  const abort = useCallback(() => chat.abort(runtimeTopicId), [chat, runtimeTopicId]);
  const sendText = useCallback(
    (input: ChatSendNewTopicTextInput) => {
      if (!topicId) {
        return chat.sendNewTopicText(input);
      }

      return chat.sendText({ ...input, topicId });
    },
    [chat, topicId],
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
