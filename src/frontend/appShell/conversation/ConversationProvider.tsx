import { useQueryClient } from '@tanstack/react-query';
import { createContext, type PropsWithChildren, use, useEffect, useRef, useState } from 'react';

import { queryKeys, useBackendModule } from '@/frontend/data';
import { cacheService } from '@/frontend/data/CacheService';
import { useApiClient } from '@/frontend/data/DataApiProvider';

import { subscribeCatalogDirectoryChanges } from './conversationCatalogCache';
import { createConversationSources } from './createConversationSources';

const ConversationContext = createContext<ReturnType<typeof createConversationSources> | null>(
  null,
);

/** Owns the catalog sources the sidebar, Agent picker and remote chat retain. */
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
    }),
  );
  useEffect(() => subscribeCatalogDirectoryChanges(api, queryClient), [api, queryClient]);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
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
