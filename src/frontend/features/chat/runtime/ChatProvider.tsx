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
import { loggerService } from '@/shared/core/logger/LoggerService';

import { persistSessionWebSearchSelection } from '../sessionWebSearchSelection';
import { AgentSessionChatClient, type AgentSessionChatState } from './AgentSessionChatClient';

const logger = loggerService.withContext('ChatProvider');

type AgentChatSendInput = {
  agentId?: string;
  modelId?: AgentSubmitMessageInput['modelId'];
  parts: AgentInputPart[];
  reasoningEffort?: AgentSubmitMessageInput['reasoningEffort'];
  sessionId?: string;
  temporaryCapabilities?: AgentSubmitMessageInput['temporaryCapabilities'];
};

type AgentChatContextValue = {
  client: AgentSessionChatClient;
  sendMessage: (input: AgentChatSendInput) => Promise<void>;
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

  const sendMessage = useCallback(
    async ({
      agentId,
      modelId,
      parts,
      reasoningEffort,
      sessionId,
      temporaryCapabilities,
    }: AgentChatSendInput) => {
      let targetSessionId = sessionId;
      if (!targetSessionId) {
        if (!agentId) {
          throw new Error('Select an Agent before sending a message.');
        }

        const session = await client.startSession(agentId, parts, {
          ...(modelId !== undefined ? { modelId } : {}),
          ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
          ...(temporaryCapabilities !== undefined ? { temporaryCapabilities } : {}),
        });
        targetSessionId = session.id;
        try {
          persistSessionWebSearchSelection(
            targetSessionId,
            temporaryCapabilities?.includes('web-search') ?? false,
          );
        } catch (error) {
          logger.warn('Failed to persist Session web-search selection', error as Error, {
            sessionId: targetSessionId,
          });
        }
        navigation.openSession(targetSessionId, agentId);
        void queryClient.invalidateQueries({ queryKey: queryKeys.agentSessions.all() });
        return;
      }

      await client.submitMessage(targetSessionId, parts, {
        ...(modelId !== undefined ? { modelId } : {}),
        ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
        ...(temporaryCapabilities !== undefined ? { temporaryCapabilities } : {}),
      });
    },
    [client, navigation, queryClient],
  );
  const value = useMemo(() => ({ client, sendMessage }), [client, sendMessage]);

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
  const { client, sendMessage } = useAgentChatContext();
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
      sendMessage({ agentId, sessionId, ...message }),
    [agentId, sendMessage, sessionId],
  );

  return {
    cancel,
    isBusy:
      activeTurnStatus !== undefined &&
      activeTurnStatus !== 'completed' &&
      activeTurnStatus !== 'failed' &&
      activeTurnStatus !== 'cancelled' &&
      activeTurnStatus !== 'interrupted',
    sendMessage: send,
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
