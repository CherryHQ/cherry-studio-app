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

import type { ConversationImageResult } from '@/frontend/appShell/conversation';
import { chatHref, chatRouteParams } from '@/frontend/appShell/navigation/chat';
import { ToolInputPreviewProvider } from '@/frontend/components/Message';
import { queryKeys, useBackendModule } from '@/frontend/data';
import {
  type AgentMessageView,
  AgentProtocolError,
  type AgentQueuedInput,
  type AgentSubmitMessageInput,
} from '@/shared/contracts/agent';
import type { UniqueModelId } from '@/shared/data/types/model';

import {
  type AgentChatDraftHandoff,
  createAgentChatDraftHandoffState,
} from './agentChatDraftHandoff';
import { latestAgentImageResult, latestConversationImageResult } from './agentImageResult';
import { createPendingChatMessages } from './agentMessageProjection';
import {
  AgentSessionChatClient,
  isAgentSessionExecuting,
  type AgentSessionChatState,
} from './AgentSessionChatClient';
import { localImageResult } from './localImageResult';

type AgentChatSendInput = AgentSubmitMessageInput & {
  agentId?: string;
  workspaceFolderId?: string;
  isNewSession: boolean;
  isCurrent: () => boolean;
};

export type PendingChatSend = Readonly<{
  sessionId: string;
  isNewSession: boolean;
  messages: ReturnType<typeof createPendingChatMessages>;
}>;

type AgentChatContextValue = {
  client: AgentSessionChatClient;
  completeDraftHandoff: (sessionId: string) => void;
  getDraftHandoff: (sessionId: string | undefined) => AgentChatDraftHandoff | undefined;
  /** Session metadata changed outside an observed event, such as a fork creating a new Session. */
  onSessionChanged: (sessionId: string) => void;
  sendMessage: (input: AgentChatSendInput) => Promise<void>;
};

const EMPTY_AGENT_SESSION_STATE: AgentSessionChatState = Object.freeze({
  activeTurn: null,
  queuedInputs: Object.freeze([]),
  liveMessages: Object.freeze([]),
  pendingApprovals: Object.freeze([]),
  pendingQuestion: null,
  sessionId: '',
  status: 'idle',
});

const AgentChatContext = createContext<AgentChatContextValue | null>(null);

/** Owns the local Session observation client together with composer navigation. */
export function ChatProvider({ children }: PropsWithChildren) {
  const agent = useBackendModule('agent');
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const router = useRouter();
  const [navigation] = useState(() => createChatNavigation({ pathname, router }));
  const [draftHandoff] = useState(createAgentChatDraftHandoffState);
  const onSessionChanged = useCallback(
    (sessionId: string) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.agentSessions.all() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.agentSessions.detail(sessionId) }),
      ]);
    },
    [queryClient],
  );
  const [client] = useState(
    () =>
      new AgentSessionChatClient(agent, {
        onSessionChanged,
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
      if (nextState === 'background') {
        client.pauseObservedSessions();
      } else if (nextState === 'active') {
        void client.resumeObservedSessions();
      }
    });
    if (AppState.currentState === 'background') {
      client.pauseObservedSessions();
    }

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
  const value = useMemo(
    () => ({
      client,
      completeDraftHandoff: draftHandoff.complete,
      getDraftHandoff: draftHandoff.get,
      onSessionChanged,
      sendMessage,
    }),
    [client, draftHandoff, onSessionChanged, sendMessage],
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

/** The observation client and its metadata invalidation, for the local read model. */
export function useAgentChatClient() {
  const { client, onSessionChanged } = useAgentChatContext();
  return { client, onSessionChanged };
}

/** The complete observed state of one Session; selectors below narrow it for the composer. */
export function useAgentSessionState(sessionId: string | undefined) {
  return useAgentSessionSelection(useAgentChatContext().client, sessionId, selectSessionState);
}

/** The named answers among the Session's live rows, in `ids` order; the same array while they read the same. */
export function useAgentLiveAnswers(
  sessionId: string | undefined,
  ids: readonly string[],
): readonly (AgentMessageView | undefined)[] {
  const idsKey = ids.join('\n');
  const select = useMemo(() => selectLiveAnswers(idsKey ? idsKey.split('\n') : []), [idsKey]);
  return useAgentSessionSelection(useAgentChatContext().client, sessionId, select);
}

function selectLiveAnswers(ids: readonly string[]) {
  let previous: readonly (AgentMessageView | undefined)[] = [];
  return (state: AgentSessionChatState) => {
    const next = ids.map((id) => state.liveMessages.find((message) => message.id === id));
    if (next.length === previous.length && next.every((message, i) => message === previous[i]))
      return previous;
    previous = next;
    return next;
  };
}

/** Retain the result as live messages settle into (or leave) the visible history window. */
export function useAgentChatImageResult(
  sessionId: string | undefined,
  persistedResult: ConversationImageResult | undefined,
) {
  const { client } = useAgentChatContext();
  const liveResult = useAgentSessionSelection(client, sessionId, selectImageResult);
  const [remembered, setRemembered] = useState<{
    sessionId: string | undefined;
    message: ConversationImageResult | undefined;
  }>({ sessionId, message: undefined });
  const liveImage = useMemo(
    () => (liveResult ? localImageResult(liveResult) : undefined),
    [liveResult],
  );
  const candidates = [remembered.message, persistedResult, liveImage].filter(
    (message): message is ConversationImageResult =>
      Boolean(message && message.sessionId === sessionId),
  );
  const latest = latestConversationImageResult(candidates);
  if (remembered.sessionId !== sessionId || remembered.message !== latest) {
    setRemembered({ sessionId, message: latest });
  }
  return latest;
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
  sshDraftId?: string;
  workspaceFolderId?: string | null;
  sessionId?: string;
  composerKey: number;
}) {
  const { client, sendMessage } = useAgentChatContext();
  const { agentId, composerKey, sessionId, workspaceFolderId, sshDraftId } = input;
  const ssh = useBackendModule('ssh');
  const activeTurnStatus = useAgentSessionSelection(client, sessionId, selectActiveTurnStatus);
  const observationStatus = useAgentSessionSelection(client, sessionId, selectObservationStatus);
  const isComposerBusy = useAgentSessionSelection(client, sessionId, selectComposerBusy);
  const isSessionExecuting = useAgentSessionSelection(client, sessionId, isAgentSessionExecuting);
  const isAdmitting = useAgentSessionSelection(client, sessionId, selectIsAdmitting);
  const [submission, setSubmission] = useState<{
    composerKey: number;
    userMessageId: string;
    isSubmitting: boolean;
    selectedMessageId?: string | null;
    send?: PendingChatSend;
  }>();
  const currentSubmission = submission?.composerKey === composerKey ? submission : undefined;
  const pending = currentSubmission?.send;
  const isSubmitting = Boolean(currentSubmission?.isSubmitting);
  const selectedMessageId = currentSubmission?.selectedMessageId;
  const selectSendReconciled = useCallback(
    (state: AgentSessionChatState) => {
      if (!pending) return false;
      const [user, assistant] = pending.messages;
      const activeNodeId = state.snapshot?.session.activeNodeId;
      return (
        state.queuedInputs.some((input) => input.userMessage.id === user.id) ||
        pending.messages.every((row) =>
          state.liveMessages.some((message) => message.id === row.id),
        ) ||
        // Admission selects the reserved answer. Any other selection belongs to the reader.
        (selectedMessageId !== undefined &&
          activeNodeId !== undefined &&
          activeNodeId !== selectedMessageId &&
          activeNodeId !== assistant.id)
      );
    },
    [pending, selectedMessageId],
  );
  // Observe the source rows before branch filtering, including queue updates after admission.
  const isSendReconciled = useAgentSessionSelection(client, sessionId, selectSendReconciled);
  const pendingSend = isSendReconciled ? undefined : pending;
  if (isSendReconciled && currentSubmission?.send) {
    setSubmission({ ...currentSubmission, send: undefined });
  }
  // A send captures its composer key; a late completion compares it with the
  // mounted key so a composer the user has left cannot navigate or update state.
  const mountedComposerKeyRef = useRef<number | null>(composerKey);
  useEffect(() => {
    mountedComposerKeyRef.current = composerKey;
    return () => {
      mountedComposerKeyRef.current = null;
    };
  }, [composerKey]);

  const cancellationSessionId = sessionId ?? pendingSend?.sessionId;
  const cancel = useCallback(() => {
    if (!cancellationSessionId) return Promise.resolve();
    const state = client.getState(cancellationSessionId);
    const messageId = selectRunningAnswerId(state);
    if (messageId) return client.cancelTurn(cancellationSessionId, messageId);
    // A settled or historical branch must not stop another model's background reply.
    return isAgentSessionExecuting(state)
      ? Promise.resolve()
      : client.cancelTurn(cancellationSessionId);
  }, [client, cancellationSessionId]);
  const send = useCallback(
    async ({
      additionalModelIds,
      ...message
    }: Omit<
      AgentSubmitMessageInput,
      'sessionId' | 'userMessageId' | 'assistantMessageId' | 'additionalReplies'
    > & {
      /** Further models answering the same question in parallel. */
      additionalModelIds?: readonly UniqueModelId[];
    }) => {
      const isCurrent = () => mountedComposerKeyRef.current === composerKey;
      const request = {
        ...message,
        sessionId: sessionId ?? uuidv7(),
        userMessageId: uuidv7(),
        assistantMessageId: uuidv7(),
        ...(additionalModelIds?.length
          ? {
              additionalReplies: additionalModelIds.map((modelId) => ({
                modelId,
                assistantMessageId: uuidv7(),
              })),
            }
          : {}),
      };
      const pending: PendingChatSend = {
        sessionId: request.sessionId,
        isNewSession: !sessionId,
        messages: createPendingChatMessages(request),
      };
      const state = sessionId ? client.getState(sessionId) : undefined;
      setSubmission({
        composerKey,
        userMessageId: request.userMessageId,
        isSubmitting: true,
        selectedMessageId: state?.snapshot?.session.activeNodeId,
        // A follow-up behind a running answer waits in the queue, which displays it.
        ...(state && selectRunningAnswerId(state) ? {} : { send: pending }),
      });
      try {
        if (!sessionId && sshDraftId) await ssh.attachDraftTarget(sshDraftId, request.sessionId);
        await sendMessage({
          ...request,
          agentId,
          isCurrent,
          isNewSession: pending.isNewSession,
          ...(!sessionId && workspaceFolderId ? { workspaceFolderId } : {}),
        });
        if (!sessionId && sshDraftId)
          void ssh.selectTarget(`draft:${sshDraftId}`, null).catch(() => {});
        if (isCurrent()) {
          setSubmission((current) =>
            current?.composerKey === composerKey && current.userMessageId === request.userMessageId
              ? { ...current, isSubmitting: false }
              : current,
          );
        }
      } catch (error) {
        if (!sessionId && sshDraftId)
          void ssh.selectTarget(request.sessionId, null).catch(() => {});
        if (isCurrent())
          setSubmission((current) =>
            current?.composerKey === composerKey && current.userMessageId === request.userMessageId
              ? { ...current, isSubmitting: false, send: undefined }
              : current,
          );
        // Stop during admission: the composer takes the draft back without a failure.
        throw error instanceof AgentProtocolError && error.view.code === 'CANCELLED'
          ? Object.assign(new Error(error.message), { name: 'AbortError' })
          : error;
      }
    },
    [agentId, client, composerKey, sendMessage, sessionId, workspaceFolderId, sshDraftId, ssh],
  );
  const completePendingSend = useCallback(
    (userMessageId: string) => {
      setSubmission((current) =>
        current?.composerKey === composerKey &&
        current.userMessageId === userMessageId &&
        current.send
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
      isAdmitting ||
      isSubmitting ||
      (isSessionExecuting && !isComposerBusy) ||
      (pendingSend && sessionId && observationStatus !== 'ready')
        ? false
        : undefined,
    isApprovalPending:
      activeTurnStatus === 'awaiting-approval' || activeTurnStatus === 'awaiting-input',
    isBusy: isComposerBusy || isSubmitting,
    sendMessage: send,
  };
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
function selectComposerBusy(state: AgentSessionChatState) {
  return Boolean(state.isSubmitting || selectRunningAnswerId(state));
}

/** The composer follows the selected branch, including its unstarted follow-up inputs. */
function selectRunningAnswerId(state: AgentSessionChatState): string | undefined {
  const turn = isAgentSessionExecuting(state) ? state.activeTurn : null;
  let id = state.snapshot?.session.activeNodeId ?? turn?.assistantMessageId;
  while (id) {
    const message = state.liveMessages.find((candidate) => candidate.id === id);
    if (message) {
      if (message.role === 'assistant')
        return message.status === 'pending' || message.status === 'streaming'
          ? message.id
          : undefined;
      id = message.parentId ?? '';
    } else {
      const queued = state.queuedInputs.find(
        (input) => input.assistantMessageId === id || input.userMessage.id === id,
      );
      if (!queued) return id === turn?.assistantMessageId ? id : undefined;
      id = queued.userMessage.parentId ?? '';
    }
  }
  return undefined;
}

/** Queue subscribers do not rerender for streamed message content. */
export function useAgentQueuedInputs(sessionId: string | undefined): readonly AgentQueuedInput[] {
  const { client } = useAgentChatContext();
  return useAgentSessionSelection(client, sessionId, selectQueuedInputs);
}

function selectQueuedInputs(state: AgentSessionChatState) {
  return state.queuedInputs;
}
function selectIsAdmitting(state: AgentSessionChatState) {
  return Boolean(state.isSubmitting);
}
function selectImageResult(state: AgentSessionChatState) {
  return latestAgentImageResult(state.liveMessages);
}
function selectSessionState(state: AgentSessionChatState) {
  return state;
}
function selectObservationStatus(state: AgentSessionChatState) {
  return state.status;
}
