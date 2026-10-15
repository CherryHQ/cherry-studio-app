import { useFocusEffect } from 'expo-router';
import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import type { ConversationMessage } from '@/frontend/appShell/conversation';
import type { MessageListItem } from '@/frontend/components/Message';
import { useBackendModule } from '@/frontend/data';
import { useApiClient } from '@/frontend/data/DataApiProvider';

import { useChatMessageRow } from '../context/ChatMessageRowContext';
import { messageTranslationSource } from './messageTranslationSource';
import { EMPTY_TRANSLATION, MessageTranslationStore } from './MessageTranslationStore';

const TranslationContext = createContext<MessageTranslationStore | null>(null);
const unsubscribeNothing = () => {};
type ProviderProps = PropsWithChildren<{
  isEnabled: boolean;
  sessionId: string;
  messages: readonly ConversationMessage[];
}>;

export function MessageTranslationProvider(props: ProviderProps) {
  if (!props.isEnabled)
    return <TranslationContext value={null}>{props.children}</TranslationContext>;
  return <SessionTranslationProvider key={props.sessionId} {...props} />;
}

function SessionTranslationProvider({ children, sessionId, messages }: ProviderProps) {
  const translator = useBackendModule('translation');
  const dataApi = useApiClient();
  const [store] = useState(() => new MessageTranslationStore(translator, dataApi, sessionId));
  useFocusEffect(useCallback(() => () => store.cancelAll(), [store]));
  useLayoutEffect(() => {
    store.reconcile(messages);
  }, [messages, store]);
  return <TranslationContext value={store}>{children}</TranslationContext>;
}

/** Both the toolbar action and its content subscribe to this message alone. */
export function useMessageTranslation(message: MessageListItem) {
  const store = use(TranslationContext);
  const row = useChatMessageRow(message.id);
  const source = useMemo(
    () =>
      !store ||
      row.completeness === 'partial' ||
      (row.messageState && row.messageState !== 'success')
        ? undefined
        : messageTranslationSource(message),
    [message, row.completeness, row.messageState, store],
  );
  const subscribe = useCallback(
    (listener: () => void) =>
      store && source ? store.subscribe(source.messageId, listener) : unsubscribeNothing,
    [source, store],
  );
  const getSnapshot = useCallback(
    () => (store && source ? store.get(source) : EMPTY_TRANSLATION),
    [source, store],
  );
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return store && source ? { state, source, store } : undefined;
}
