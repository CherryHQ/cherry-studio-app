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
import { v7 as uuidv7 } from 'uuid';

import { chatHref, chatRouteParams } from '@/frontend/appShell/navigation/chat';
import { ToolInputPreviewProvider } from '@/frontend/components/Message';
import { queryKeys, useBackendModule } from '@/frontend/data';
import type { AgentSubmitMessageInput } from '@/shared/contracts/agent';

import {
  type AgentChatDraftHandoff,
  createAgentChatDraftHandoffState,
} from './agentChatDraftHandoff';
import { createPendingChatMessages } from './agentMessageProjection';
import { AgentSessionChatClient, type AgentSessionChatState } from './AgentSessionChatClient';

type AgentChatSendInput = AgentSubmitMessageInput & {
  agentId?: string;
  isNewSession: boolean;
  isCurrent: () => boolean;
};

export type PendingChatSend = Readonly<{
  sessionId: string;
  isNewSession: boolean;
  isSubmitting: boolean;
  messages: ReturnType<typeof createPendingChatMessages>;
}>;

type AgentChatForkInput = {
  fromMessageId: string;
  sessionId: string;
  /** Localized name for the copy; omitted, the fork inherits the source's. */
  title?: string;
};

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
  const [draftHandoff] = useState(createAgentChatDraftHandoffState);
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
    async ({ agentId, isCurrent, isNewSession, ...submission }: AgentChatSendInput) => {
      if (isNewSession) {
        if (!agentId) {
          throw new Error('Select an Agent before sending a message.');
        }
        const session = await client.startSession({
          ...submission,
          agentId,
          executionTarget: { kind: 'local' },
        });
        if (isCurrent()) {
          draftHandoff.handoffToSession({ agentId, sessionId: session.id }, navigation.openSession);
        }
        void queryClient.invalidateQueries({ queryKey: queryKeys.agentSessions.all() });
        return;
      }
      await client.submitMessage(submission);
    },
    [client, draftHandoff, navigation, queryClient],
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
    () => ({
      client,
      completeDraftHandoff: draftHandoff.complete,
      forkSession,
      getDraftHandoff: draftHandoff.get,
      sendMessage,
    }),
    [client, draftHandoff, forkSession, sendMessage],
  );

  return (
    <AgentChatContext value={value}>
      <ToolInputPreviewProvider source={client.toolInputPreviews}>
        {children}
      </ToolInputPreviewProvider>
    </AgentChatContext>
  );
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

export function useAgentChatControls(input: {
  agentId?: string;
  sessionId?: string;
  composerKey: number;
}) {
  const { client, sendMessage } = useAgentChatContext();
  const { agentId, composerKey, sessionId } = input;
  const activeTurnStatus = useAgentSessionSelection(client, sessionId, selectActiveTurnStatus);
  const observationStatus = useAgentSessionSelection(client, sessionId, selectObservationStatus);
  const [submission, setSubmission] = useState<{
    composerKey: number;
    userMessageId: string;
    send?: PendingChatSend;
  }>();
  const currentSubmission = submission?.composerKey === composerKey ? submission : undefined;
  const pendingSend = currentSubmission?.send;
  // A send captures its composer key; a late completion compares it with the
  // mounted key so a composer the user has left cannot navigate or update state.
  const mountedComposerKeyRef = useRef<number | null>(composerKey);
  useEffect(() => {
    mountedComposerKeyRef.current = composerKey;
    return () => {
      mountedComposerKeyRef.current = null;
    };
  }, [composerKey]);

  const cancel = useCallback(() => {
    return sessionId ? client.cancelTurn(sessionId) : Promise.resolve();
  }, [client, sessionId]);
  const send = useCallback(
    async (
      message: Omit<AgentSubmitMessageInput, 'sessionId' | 'userMessageId' | 'assistantMessageId'>,
    ) => {
      const isCurrent = () => mountedComposerKeyRef.current === composerKey;
      const request = {
        ...message,
        sessionId: sessionId ?? uuidv7(),
        userMessageId: uuidv7(),
        assistantMessageId: uuidv7(),
      };
      const pending: PendingChatSend = {
        sessionId: request.sessionId,
        isNewSession: !sessionId,
        isSubmitting: true,
        messages: createPendingChatMessages(request),
      };
      setSubmission({ composerKey, userMessageId: request.userMessageId, send: pending });
      try {
        await sendMessage({ ...request, agentId, isCurrent, isNewSession: pending.isNewSession });
        if (isCurrent()) {
          setSubmission((current) =>
            current?.send === pending
              ? { ...current, send: { ...pending, isSubmitting: false } }
              : current,
          );
        }
      } catch (error) {
        if (isCurrent())
          setSubmission((current) =>
            current?.send === pending ? { ...current, send: undefined } : current,
          );
        throw error;
      }
    },
    [agentId, composerKey, sendMessage, sessionId],
  );
  const completePendingSend = useCallback(
    (userMessageId: string) => {
      setSubmission((current) =>
        current?.composerKey === composerKey &&
        current.userMessageId === userMessageId &&
        current.send &&
        !current.send.isSubmitting
          ? { ...current, send: undefined }
          : current,
      );
    },
    [composerKey],
  );

  return {
    cancel,
    completePendingSend,
    pendingSend,
    enteringUserMessageId: currentSubmission?.userMessageId,
    canSend:
      pendingSend && (pendingSend.isSubmitting || (sessionId && observationStatus !== 'ready'))
        ? false
        : undefined,
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

function selectActiveTurnStatus(state: AgentSessionChatState) {
  return state.activeTurn?.status;
}
function selectSessionState(state: AgentSessionChatState) {
  return state;
}
function selectObservationStatus(state: AgentSessionChatState) {
  return state.status;
}
