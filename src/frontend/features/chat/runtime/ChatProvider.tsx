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
import { AppState } from 'react-native';

import { queryKeys, useBackendModule } from '@/frontend/data';
import type { AgentInputPart, AgentSubmitMessageInput } from '@/shared/contracts/agent';

import { AgentSessionChatClient, type AgentSessionChatState } from './AgentSessionChatClient';

type AgentChatSendInput = {
  agentId?: string;
  modelId?: AgentSubmitMessageInput['modelId'];
  reasoningEffort?: AgentSubmitMessageInput['reasoningEffort'];
  sessionId?: string;
  text: string;
};

type AgentChatContextValue = {
  client: AgentSessionChatClient;
  sendText: (input: AgentChatSendInput) => Promise<void>;
};

const EMPTY_AGENT_SESSION_STATE: AgentSessionChatState = Object.freeze({
  activeTurn: null,
  liveMessages: Object.freeze([]),
  pendingApprovals: Object.freeze([]),
  sessionId: '',
  status: 'idle',
});

const AgentChatContext = createContext<AgentChatContextValue | null>(null);

export function ChatProvider({ children }: PropsWithChildren) {
  const agent = useBackendModule('agent');
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const router = useRouter();
  const [navigation] = useState(() => createChatNavigation({ pathname, router }));
  const [client] = useState(
    () =>
      new AgentSessionChatClient(agent, {
        onSessionChanged: (sessionId) => {
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.agentSessions.all() }),
            queryClient.invalidateQueries({
              queryKey: queryKeys.agentSessions.detail(sessionId),
            }),
          ]);
        },
        onTranscriptChanged: (sessionId) => {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.agentSessions.messages(sessionId),
          });
        },
      }),
  );

  useEffect(() => {
    navigation.update({ pathname, router });
  }, [navigation, pathname, router]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void client.refreshObservedSessions();
      }
    });

    return () => subscription.remove();
  }, [client]);
  useEffect(() => () => client.dispose(), [client]);

  const sendText = useCallback(
    async ({ agentId, modelId, reasoningEffort, sessionId, text }: AgentChatSendInput) => {
      let targetSessionId = sessionId;
      if (!targetSessionId) {
        if (!agentId) {
          throw new Error('Select an Agent before sending a message.');
        }

        const session = await client.createSession(agentId);
        targetSessionId = session.id;
        await client.observe(targetSessionId);
        navigation.openSession(targetSessionId, agentId);
        await queryClient.invalidateQueries({ queryKey: queryKeys.agentSessions.all() });
      }

      const parts: AgentInputPart[] = [{ text, type: 'text' }];
      await client.submitMessage(targetSessionId, parts, {
        ...(modelId !== undefined ? { modelId } : {}),
        ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
      });
    },
    [client, navigation, queryClient],
  );
  const value = useMemo(() => ({ client, sendText }), [client, sendText]);

  return <AgentChatContext value={value}>{children}</AgentChatContext>;
}

function createChatNavigation(input: { pathname: string; router: ReturnType<typeof useRouter> }) {
  let navigation = input;

  return {
    openSession: (sessionId: string, agentId: string) => {
      const params = {
        agentId,
        sessionId,
      };
      if (navigation.pathname === '/') {
        navigation.router.setParams(params);
        return;
      }

      navigation.router.replace({ params, pathname: '/' });
    },
    update: (nextNavigation: typeof input) => {
      navigation = nextNavigation;
    },
  };
}

function useAgentChatContext() {
  const context = use(AgentChatContext);
  if (!context) {
    throw new Error('Agent chat hooks must be used within ChatProvider');
  }
  return context;
}

export function useAgentChatSession(sessionId: string | undefined): AgentSessionChatState {
  const { client } = useAgentChatContext();
  return useAgentSessionSelection(client, sessionId, selectSessionState);
}

export function useAgentChatControls(input: { agentId?: string; sessionId?: string }) {
  const { client, sendText } = useAgentChatContext();
  const { agentId, sessionId } = input;
  const activeTurnStatus = useAgentSessionSelection(client, sessionId, selectActiveTurnStatus);
  const cancel = useCallback(() => {
    if (!sessionId) {
      return Promise.resolve();
    }
    return client.cancelTurn(sessionId);
  }, [client, sessionId]);
  const send = useCallback(
    (message: Omit<AgentChatSendInput, 'agentId' | 'sessionId'>) =>
      sendText({ agentId, sessionId, ...message }),
    [agentId, sendText, sessionId],
  );

  return {
    cancel,
    isBusy:
      activeTurnStatus !== undefined &&
      activeTurnStatus !== 'completed' &&
      activeTurnStatus !== 'failed' &&
      activeTurnStatus !== 'cancelled' &&
      activeTurnStatus !== 'interrupted',
    sendText: send,
  };
}

export function useAgentChatActions() {
  return useAgentChatContext().client;
}

function useAgentSessionSelection<TValue>(
  client: AgentSessionChatClient,
  sessionId: string | undefined,
  select: (state: AgentSessionChatState) => TValue,
): TValue {
  const subscribe = useCallback(
    (listener: () => void) => (sessionId ? client.subscribe(sessionId, listener) : () => undefined),
    [client, sessionId],
  );
  const getSnapshot = useCallback(
    () => select(sessionId ? client.getState(sessionId) : EMPTY_AGENT_SESSION_STATE),
    [client, select, sessionId],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function selectSessionState(state: AgentSessionChatState) {
  return state;
}

function selectActiveTurnStatus(state: AgentSessionChatState) {
  return state.activeTurn?.status;
}
