import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'expo-router';
import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { AppState } from 'react-native';

import { chatHref, chatRouteParams } from '@/frontend/appShell/navigation/chat';
import { queryKeys, useBackendModule } from '@/frontend/data';
import type { AgentInputPart, AgentSubmitMessageInput } from '@/shared/contracts/agent';

import { AgentSessionChatClient, type AgentSessionChatState } from './AgentSessionChatClient';

type AgentChatSendInput = {
  agentId?: string;
  modelId?: AgentSubmitMessageInput['modelId'];
  parts: AgentInputPart[];
  reasoningEffort?: AgentSubmitMessageInput['reasoningEffort'];
  sessionId?: string;
};

type AgentChatForkInput = {
  fromMessageId: string;
  sessionId: string;
  /** Localized name for the copy; omitted, the fork inherits the source's. */
  title?: string;
};

export type AgentChatDraftHandoff = Readonly<{
  agentId: string;
  sessionId: string;
}>;

type AgentChatContextValue = {
  client: AgentSessionChatClient;
  completeDraftHandoff: (sessionId: string) => void;
  forkSession: (input: AgentChatForkInput) => Promise<void>;
  getDraftHandoff: (sessionId: string | undefined) => AgentChatDraftHandoff | undefined;
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
  const draftHandoffRef = useRef<AgentChatDraftHandoff | undefined>(undefined);
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

  const completeDraftHandoff = useCallback((sessionId: string) => {
    if (draftHandoffRef.current?.sessionId === sessionId) {
      draftHandoffRef.current = undefined;
    }
  }, []);
  const getDraftHandoff = useCallback((sessionId: string | undefined) => {
    const handoff = draftHandoffRef.current;
    return sessionId && handoff?.sessionId === sessionId ? handoff : undefined;
  }, []);

  const sendMessage = useCallback(
    async ({ agentId, modelId, parts, reasoningEffort, sessionId }: AgentChatSendInput) => {
      let targetSessionId = sessionId;
      if (!targetSessionId) {
        if (!agentId) {
          throw new Error('Select an Agent before sending a message.');
        }

        const session = await client.startSession(agentId, parts, {
          ...(modelId !== undefined ? { modelId } : {}),
          ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
        });
        targetSessionId = session.id;
        // Publish the one-shot handoff before mutating the route. The route
        // change is what makes the chat content read and consume this value.
        draftHandoffRef.current = { agentId, sessionId: targetSessionId };
        navigation.openSession(targetSessionId);
        void queryClient.invalidateQueries({ queryKey: queryKeys.agentSessions.all() });
        return;
      }

      await client.submitMessage(targetSessionId, parts, {
        ...(modelId !== undefined ? { modelId } : {}),
        ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
      });
    },
    [client, navigation, queryClient],
  );
  const forkSession = useCallback(
    async ({ fromMessageId, sessionId, title }: AgentChatForkInput) => {
      const session = await client.forkSession(sessionId, fromMessageId, title);
      navigation.openSession(session.id);
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentSessions.all() });
    },
    [client, navigation, queryClient],
  );
  const value = useMemo(
    () => ({ client, completeDraftHandoff, forkSession, getDraftHandoff, sendMessage }),
    [client, completeDraftHandoff, forkSession, getDraftHandoff, sendMessage],
  );

  return <AgentChatContext value={value}>{children}</AgentChatContext>;
}

function createChatNavigation(input: { pathname: string; router: ReturnType<typeof useRouter> }) {
  let navigation = input;

  return {
    openSession: (sessionId: string) => {
      const target = { kind: 'session' as const, sessionId };
      if (navigation.pathname === '/') {
        navigation.router.setParams(chatRouteParams(target));
        return;
      }

      navigation.router.replace(chatHref(target));
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

/** Keeps the Draft composer mounted while its accepted first message becomes a Session route. */
export function useAgentChatDraftHandoff(
  sessionId: string | undefined,
): AgentChatDraftHandoff | undefined {
  const { completeDraftHandoff, getDraftHandoff } = useAgentChatContext();
  const handoff = getDraftHandoff(sessionId);

  useEffect(() => {
    if (handoff) {
      completeDraftHandoff(handoff.sessionId);
    }
  }, [completeDraftHandoff, handoff]);

  return handoff;
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
    isApprovalPending: activeTurnStatus === 'awaiting-approval',
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

/** Forks a Session at one message and navigates to the copy. */
export function useAgentChatFork() {
  return useAgentChatContext().forkSession;
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
