import { useQueryClient } from '@tanstack/react-query';
import { createContext, type PropsWithChildren, use, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { queryKeys, useBackendModule } from '@/frontend/data';
import { cacheService } from '@/frontend/data/CacheService';
import { useApiClient } from '@/frontend/data/DataApiProvider';

import { subscribeCatalogDirectoryChanges } from './conversationCatalogCache';
import { createConversationSources } from './createConversationSources';

const ConversationContext = createContext<ReturnType<typeof createConversationSources> | null>(
  null,
);

/** App-shell consumption owner shared by chat, source catalogs and transcript export. */
export function ConversationProvider({ children }: PropsWithChildren) {
  const agent = useBackendModule('agent');
  const remoteAgent = useBackendModule('remoteAgent');
  const api = useApiClient();
  const queryClient = useQueryClient();
  const [sources] = useState(() =>
    createConversationSources({
      agent,
      remoteAgent,
      api,
      readMarks: {
        get: (id) => cacheService.get(`chat.last_seen_turn.${id}`),
        subscribe: (id, listener) => {
          const key = `chat.last_seen_turn.${id}` as const;
          cacheService.registerHook(key);
          const unsubscribe = cacheService.subscribe(key, listener);
          return () => {
            unsubscribe();
            cacheService.unregisterHook(key);
          };
        },
      },
      onSessionChanged: (sessionId) => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.agentSessions.all() });
        void queryClient.invalidateQueries({ queryKey: queryKeys.agentSessions.detail(sessionId) });
      },
      onTranscriptChanged: (sessionId) => {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.agentSessions.messages(sessionId),
        });
      },
    }),
  );
  useEffect(() => subscribeCatalogDirectoryChanges(api, queryClient), [api, queryClient]);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sources.local.client.refreshObservedSessions();
    });
    return () => {
      subscription.remove();
      mounted.current = false;
      // Strict Mode replays setup synchronously; only the actual app-owner release disposes sources.
      queueMicrotask(() => {
        if (!mounted.current) sources.dispose();
      });
    };
  }, [sources]);
  return <ConversationContext value={sources}>{children}</ConversationContext>;
}
export function useConversationSources() {
  const sources = use(ConversationContext);
  if (!sources) throw new Error('Conversation consumers require ConversationProvider');
  return sources;
}
/** Local composer extensions remain available while its UI adopts the common session actions. */
export function useLocalConversation() {
  return useConversationSources().local;
}
