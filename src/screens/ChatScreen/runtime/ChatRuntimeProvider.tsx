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

import { useDataServices } from '@/data/runtime';
import { getMessagesQueryKey } from '@/hooks/chat/utils/messageQueryOptions';
import { BackgroundReplyService } from '@/services/backgroundReply';

import {
  ChatRuntime,
  type ChatRuntimeSendNewTopicTextInput,
  type ChatRuntimeTopicSnapshot,
  newTopicRuntimeId,
} from './ChatRuntime';

type ChatRuntimeContextValue = {
  runtime: ChatRuntime;
};

type ChatRuntimeTopicValue = ChatRuntimeTopicSnapshot & {
  abort: () => void;
  isBusy: boolean;
  sendText: (input: ChatRuntimeSendNewTopicTextInput) => Promise<void>;
};

const ChatRuntimeContext = createContext<ChatRuntimeContextValue | null>(null);

export function ChatRuntimeProvider({ children }: PropsWithChildren) {
  const services = useDataServices();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const router = useRouter();
  const [navigation] = useState(() => createChatRuntimeNavigation({ pathname, router }));
  const [backgroundReply] = useState(
    () => new BackgroundReplyService({ preference: services.preference }),
  );
  const [runtime] = useState(
    () =>
      new ChatRuntime({
        backgroundReply,
        services,
        invalidateTopics: async () => {
          await queryClient.invalidateQueries({ queryKey: ['/topics'] });
        },
        invalidateTopicMessages: async (topicId) => {
          await queryClient.invalidateQueries({ queryKey: getMessagesQueryKey(topicId) });
        },
        openTopic: navigation.openTopic,
      }),
  );
  const contextValue = useMemo(() => ({ runtime }), [runtime]);

  useEffect(() => {
    navigation.update({ pathname, router });
  }, [navigation, pathname, router]);
  useEffect(
    () => () => {
      runtime.dispose();
      backgroundReply.dispose();
    },
    [backgroundReply, runtime],
  );

  return <ChatRuntimeContext value={contextValue}>{children}</ChatRuntimeContext>;
}

function createChatRuntimeNavigation(input: {
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

export function useChatRuntime() {
  const context = use(ChatRuntimeContext);

  if (!context) {
    throw new Error('useChatRuntime must be used within ChatRuntimeProvider');
  }

  return context.runtime;
}

export function useChatRuntimeTopic(topicId?: string): ChatRuntimeTopicValue {
  const runtime = useChatRuntime();
  const runtimeTopicId = topicId ?? newTopicRuntimeId;
  const snapshot = useSyncExternalStore(
    runtime.subscribe,
    () => runtime.getTopicSnapshot(runtimeTopicId),
    () => runtime.getTopicSnapshot(runtimeTopicId),
  );
  const abort = useCallback(() => runtime.abort(runtimeTopicId), [runtime, runtimeTopicId]);
  const sendText = useCallback(
    (input: ChatRuntimeSendNewTopicTextInput) => {
      if (!topicId) {
        return runtime.sendNewTopicText(input);
      }

      return runtime.sendText({ ...input, topicId });
    },
    [runtime, topicId],
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
