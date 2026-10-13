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
import { useTranslation } from 'react-i18next';

import type { ConversationMessage } from '@/frontend/appShell/conversation';
import type { MessageListItem } from '@/frontend/components/Message';
import { useBackendModule } from '@/frontend/data';
import { cacheService } from '@/frontend/data/CacheService';
import { resolveAppLanguage, type AppLanguage } from '@/shared/utils/languages';

import { useChatMessageRow } from '../context/ChatMessageRowContext';
import { messageTranslationSource } from './messageTranslationSource';
import { EMPTY_TRANSLATION, MessageTranslationStore } from './MessageTranslationStore';

const TranslationContext = createContext<MessageTranslationStore | null>(null);
const unsubscribeNothing = () => {};
type ProviderProps = PropsWithChildren<{
  scope: string;
  sessionId: string;
  messages: readonly ConversationMessage[];
}>;

export function MessageTranslationProvider(props: ProviderProps) {
  const { i18n } = useTranslation();
  const language = resolveAppLanguage(i18n.resolvedLanguage ?? i18n.language);
  return (
    <SessionTranslationProvider
      key={JSON.stringify([props.scope, props.sessionId])}
      {...props}
      language={language}
    />
  );
}

function SessionTranslationProvider({
  children,
  scope,
  sessionId,
  language,
  messages,
}: ProviderProps & { language: AppLanguage }) {
  const translator = useBackendModule('translation');
  const [ownedStore, setOwnedStore] = useState(
    () => new MessageTranslationStore(translator, cacheService, scope, sessionId, language),
  );
  // Replace only the translation owner; the transcript keeps its reading and row state.
  let store = ownedStore;
  if (store.language !== language) {
    store = new MessageTranslationStore(translator, cacheService, scope, sessionId, language);
    setOwnedStore(store);
  }
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
