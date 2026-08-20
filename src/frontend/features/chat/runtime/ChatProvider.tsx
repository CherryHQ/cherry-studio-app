import type { ComposerQueuedMessagePayload } from '@cherrystudio/universal/ai/transport';
import type { UniqueModelId } from '@cherrystudio/universal/data/types/model';
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
import type {
  ChatEditAndResendInput,
  ChatModule,
  ChatRegenerateInput,
  ChatSendNewTopicMultiModelTextInput,
  ChatSendNewTopicTextInput,
  ChatTopicSnapshot,
} from '@/shared/contracts';
import { NEW_TOPIC_SNAPSHOT_KEY } from '@/shared/contracts';

type ChatTopicValue = ChatTopicSnapshot & {
  abort: () => void;
  cancelExecution: (executionId: UniqueModelId) => void;
  editAndResend: (input: Omit<ChatEditAndResendInput, 'topicId'>) => Promise<void>;
  isBusy: boolean;
  queueFollowUp: (payload: ComposerQueuedMessagePayload) => Promise<void>;
  regenerate: (input: Omit<ChatRegenerateInput, 'topicId'>) => Promise<void>;
  sendMultiModelText: (input: ChatSendNewTopicMultiModelTextInput) => Promise<void>;
  sendText: (input: ChatSendNewTopicTextInput) => Promise<void>;
  setActiveBranch: (throughNodeId: string) => Promise<void>;
  steer: (payload: ComposerQueuedMessagePayload) => Promise<void>;
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
      if (navigation.pathname === '/') {
        navigation.router.setParams({ topicId });
        return;
      }

      navigation.router.replace({
        params: { topicId },
        pathname: '/',
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
  const cancelExecution = useCallback(
    (executionId: UniqueModelId) => chat.cancelExecution({ executionId, topicId: runtimeTopicId }),
    [chat, runtimeTopicId],
  );
  const sendText = useCallback(
    (input: ChatSendNewTopicTextInput) => {
      if (!topicId) {
        return chat.sendNewTopicText(input);
      }

      return chat.sendText({ ...input, topicId });
    },
    [chat, topicId],
  );
  const sendMultiModelText = useCallback(
    (input: ChatSendNewTopicMultiModelTextInput) => {
      if (!topicId) {
        return chat.sendNewTopicMultiModelText(input);
      }
      return chat.sendMultiModelText({ ...input, topicId });
    },
    [chat, topicId],
  );
  const regenerate = useCallback(
    (input: Omit<ChatRegenerateInput, 'topicId'>) => {
      if (!topicId) return Promise.reject(new Error('Regenerate requires an existing topic.'));
      return chat.regenerate({ ...input, topicId });
    },
    [chat, topicId],
  );
  const editAndResend = useCallback(
    (input: Omit<ChatEditAndResendInput, 'topicId'>) => {
      if (!topicId) return Promise.reject(new Error('Edit-and-resend requires an existing topic.'));
      return chat.editAndResend({ ...input, topicId });
    },
    [chat, topicId],
  );
  const setActiveBranch = useCallback(
    (throughNodeId: string) => {
      if (!topicId)
        return Promise.reject(new Error('Branch selection requires an existing topic.'));
      return chat.setActiveBranch({ throughNodeId, topicId });
    },
    [chat, topicId],
  );
  const steer = useCallback(
    (payload: ComposerQueuedMessagePayload) => {
      if (!topicId) return Promise.reject(new Error('Steer requires an existing topic.'));
      return chat.steer({ payload, topicId });
    },
    [chat, topicId],
  );
  const queueFollowUp = useCallback(
    (payload: ComposerQueuedMessagePayload) => {
      if (!topicId) return Promise.reject(new Error('Follow-up queue requires an existing topic.'));
      return chat.queueFollowUp({ payload, topicId });
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
    cancelExecution,
    editAndResend,
    isBusy,
    queueFollowUp,
    regenerate,
    sendMultiModelText,
    sendText,
    setActiveBranch,
    steer,
  };
}
