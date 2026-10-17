import { useAlert, useToast } from '@cherrystudio/ui/components';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard } from 'react-native';

import type {
  ConversationMessage,
  ConversationSnapshot,
  ConversationAction,
} from '@/frontend/appShell/conversation';
import { conversationHref } from '@/frontend/appShell/navigation/chat';
import { loggerService } from '@/shared/core/logger/LoggerService';

import type { ChatShareTranslations } from '../../../share/chatShareHandoff';
import { getSendErrorCodeLabelKey } from '../../ChatInput/utils/sendErrorLabel';
import { useMessageTranslationStore } from '../translation/MessageTranslationProvider';

const COPIED_FEEDBACK_DURATION_MS = 1_200;
const EMPTY_MESSAGE_IDS: ReadonlySet<string> = new Set();
/** Matches the Session title column, which the fork input also caps at 255. */
const SESSION_TITLE_MAX_LENGTH = 255;
const logger = loggerService.withContext('AssistantMessageActions');

type AssistantMessageActionsState = {
  copiedMessageId?: string;
  isAssistantToolbarEnabled: boolean;
  /** A running turn owns the transcript; its rows must not disappear underneath it. */
  isDeleteDisabled: boolean;
  isRetryDisabled: boolean;
  /** Answers that can be regenerated or retried. */
  retryableMessageIds: ReadonlySet<string>;
};

type AssistantMessageActions = {
  retryAssistantMessage?: (input: { messageId: string }) => void;
  shareAssistantMessage: (input: { messageId: string }) => void;
  copyAssistantMessage: (input: { messageId: string; text: string }) => void;
  /** Copies the transcript up to this message into a new chat and opens it. */
  forkFromAssistantMessage?: (input: { messageId: string }) => void;
  deleteMessageTurn?: (input: { turnId: string }) => void;
  /** Shows another alternative at a branch point, restoring its own continuation. */
  selectBranch?: (input: { messageId: string; targetId: string }) => void;
  /** Stops one parallel answer while the others continue. */
  stopAnswer?: (input: { messageId: string }) => void;
  /** Prepares the composer to continue from this answer with chosen models. */
  continueFromAnswer?: (input: { messageId: string }) => void;
};

const AssistantMessageActionsStateContext = createContext<AssistantMessageActionsState | null>(
  null,
);
const AssistantMessageActionsContext = createContext<AssistantMessageActions | null>(null);

type AssistantMessageActionsProviderProps = PropsWithChildren<{
  isAssistantToolbarEnabled: boolean;
  /** Opens the source-owned share selector; absent while no Session exists. */
  onShare?: (messageId: string, translations?: ChatShareTranslations) => void;
  /** Local chats continue from a chosen answer; absent where branching is unsupported. */
  onContinueFrom?: (messageId: string) => void;
  snapshot: ConversationSnapshot;
  messages: readonly ConversationMessage[];
}>;

export function AssistantMessageActionsProvider({
  children,
  isAssistantToolbarEnabled,
  onShare,
  onContinueFrom,
  snapshot,
  messages,
}: AssistantMessageActionsProviderProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { alert } = useAlert();
  const translationStore = useMessageTranslationStore();
  const mounted = useRef(true);
  const inFlight = useRef(new Set<string>());
  const sharing = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useFocusEffect(
    useCallback(() => {
      sharing.current = false;
    }, []),
  );
  // Keyed by content so streamed transcript updates keep the rows' state context stable.
  const retryableKey = messages
    .flatMap((message) => (message.actions.retry ? [message.key] : []))
    .join('\n');
  const retryableMessageIds = useMemo(
    () => new Set(retryableKey ? retryableKey.split('\n') : []),
    [retryableKey],
  );
  const isBusy = snapshot.executions.some(
    (execution) =>
      execution.state === 'running' ||
      execution.state === 'awaiting-approval' ||
      execution.state === 'awaiting-input' ||
      execution.state === 'finalizing',
  );
  // Rows receive these handlers through context. The transcript and snapshot
  // change on every streamed update, so the handlers read them when invoked;
  // only whether an action exists or is enabled reaches rows as rendered state.
  const latest = useRef({
    alert,
    isBusy,
    messages,
    onContinueFrom,
    onShare,
    snapshot,
    t,
    toast,
  });
  useLayoutEffect(() => {
    latest.current = { alert, isBusy, messages, onContinueFrom, onShare, snapshot, t, toast };
  });

  const run = useCallback(
    async <Input, Output>(
      key: string,
      action: ConversationAction<Input, Output> | undefined,
      value: Input,
      errorLabel: 'retryFailed' | 'forkFailed' | 'deleteFailed' | 'branchFailed',
      applied?: (result: Output) => void,
    ) => {
      if (!action || action.availability.state !== 'enabled' || inFlight.current.has(key)) return;
      inFlight.current.add(key);
      try {
        const outcome = await action.execute(value);
        if (!mounted.current) return;
        const { t: translate, toast: currentToast } = latest.current;
        if (outcome.state === 'applied') applied?.(outcome.value);
        // A retry the user stopped before its turn was reserved did not fail.
        else if (
          (outcome.state === 'rejected' && outcome.failure.detail?.code !== 'CANCELLED') ||
          outcome.state === 'interrupted'
        )
          currentToast.show({
            label: translate(
              (outcome.state === 'rejected' &&
                getSendErrorCodeLabelKey(outcome.failure.detail?.code)) ||
                `chat.messageActions.${errorLabel}`,
            ),
            variant: 'danger',
          });
      } catch (error) {
        logger.error('Conversation message action failed', error as Error);
        if (mounted.current)
          latest.current.toast.show({
            label: latest.current.t(`chat.messageActions.${errorLabel}`),
            variant: 'danger',
          });
      } finally {
        inFlight.current.delete(key);
      }
    },
    [],
  );
  const share = useCallback(
    ({ messageId }: { messageId: string }) => {
      const { onShare: openShare } = latest.current;
      if (!openShare || sharing.current) return;
      sharing.current = true;
      Keyboard.dismiss();
      openShare(messageId, translationStore?.getExpandedTranslations());
    },
    [translationStore],
  );
  const retry = useCallback(
    ({ messageId }: { messageId: string }) => {
      const current = latest.current;
      if (current.isBusy) return;
      const action = current.messages.find((message) => message.key === messageId)?.actions.retry;
      void run(`retry:${messageId}`, action, undefined, 'retryFailed', (ref) => {
        if (ref) router.replace(conversationHref(ref));
      });
    },
    [run],
  );
  const fork = useCallback(
    ({ messageId }: { messageId: string }) => {
      const current = latest.current;
      const sourceTitle = current.snapshot.title.trim();
      const title = sourceTitle
        ? current
            .t('chat.fork.sessionTitle', { title: sourceTitle })
            .slice(0, SESSION_TITLE_MAX_LENGTH)
        : undefined;
      void run(
        `fork:${messageId}`,
        current.messages.find((message) => message.key === messageId)?.actions.fork,
        { title },
        'forkFailed',
        (ref) => router.replace(conversationHref(ref)),
      );
    },
    [run],
  );
  const remove = useCallback(
    ({ turnId }: { turnId: string }) => {
      const current = latest.current;
      const message = current.messages.find(
        (message) => message.display.turnId === turnId && message.actions.remove,
      );
      if (!message || current.isBusy) return;
      current.alert.confirm({
        confirmLabel: current.t('common.delete'),
        description: current.t('chat.messageActions.deleteMessage'),
        role: 'destructive',
        title: current.t('chat.messageActions.deleteTitle'),
        onConfirm: () => {
          void run(`delete:${turnId}`, message.actions.remove, undefined, 'deleteFailed');
        },
      });
    },
    [run],
  );
  const selectBranch = useCallback(
    ({ messageId, targetId }: { messageId: string; targetId: string }) => {
      const action = latest.current.messages.find((message) => message.key === messageId)?.actions
        .select;
      void run(`select:${messageId}`, action, { messageId: targetId }, 'branchFailed');
    },
    [run],
  );
  const stopAnswer = useCallback(
    ({ messageId }: { messageId: string }) => {
      const action = latest.current.messages.find((message) => message.key === messageId)?.actions
        .stop;
      void run(`stop:${messageId}`, action, undefined, 'branchFailed');
    },
    [run],
  );
  const continueFromAnswer = useCallback(({ messageId }: { messageId: string }) => {
    latest.current.onContinueFrom?.(messageId);
  }, []);
  return (
    <ChatMessageActionsProvider
      isAssistantToolbarEnabled={isAssistantToolbarEnabled}
      onShare={share}
      onFork={messages.some((message) => message.actions.fork) ? fork : undefined}
      onDelete={messages.some((message) => message.actions.remove) ? remove : undefined}
      onRetry={retryableMessageIds.size ? retry : undefined}
      onSelectBranch={messages.some((message) => message.actions.select) ? selectBranch : undefined}
      onStopAnswer={messages.some((message) => message.actions.stop) ? stopAnswer : undefined}
      onContinueFrom={onContinueFrom ? continueFromAnswer : undefined}
      isDeleteDisabled={isBusy}
      isRetryDisabled={isBusy}
      retryableMessageIds={retryableMessageIds}
    >
      {children}
    </ChatMessageActionsProvider>
  );
}

/** Presentation actions shared by local and PC-owned conversations. */
export function ChatMessageActionsProvider({
  children,
  isAssistantToolbarEnabled,
  onShare: shareAssistantMessage,
  onFork: forkFromAssistantMessage,
  onDelete: deleteMessageTurn,
  onRetry: retryAssistantMessage,
  onSelectBranch: selectBranch,
  onStopAnswer: stopAnswer,
  onContinueFrom: continueFromAnswer,
  isDeleteDisabled = true,
  isRetryDisabled = true,
  retryableMessageIds = EMPTY_MESSAGE_IDS,
}: PropsWithChildren<{
  isAssistantToolbarEnabled: boolean;
  onShare: AssistantMessageActions['shareAssistantMessage'];
  onFork?: AssistantMessageActions['forkFromAssistantMessage'];
  onDelete?: AssistantMessageActions['deleteMessageTurn'];
  onRetry?: AssistantMessageActions['retryAssistantMessage'];
  onSelectBranch?: AssistantMessageActions['selectBranch'];
  onStopAnswer?: AssistantMessageActions['stopAnswer'];
  onContinueFrom?: AssistantMessageActions['continueFromAnswer'];
  isDeleteDisabled?: boolean;
  isRetryDisabled?: boolean;
  retryableMessageIds?: ReadonlySet<string>;
}>) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [copiedMessageId, setCopiedMessageId] = useState<string>();
  const copiedFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyOperationIdRef = useRef(0);
  const isMountedRef = useRef(true);

  const copyAssistantMessage = useCallback(
    ({ messageId, text }: { messageId: string; text: string }) => {
      const copyOperationId = ++copyOperationIdRef.current;
      void Clipboard.setStringAsync(text)
        .then(() => {
          if (!isMountedRef.current || copyOperationId !== copyOperationIdRef.current) {
            return;
          }

          if (copiedFeedbackTimerRef.current !== null) {
            clearTimeout(copiedFeedbackTimerRef.current);
          }

          setCopiedMessageId(messageId);
          copiedFeedbackTimerRef.current = setTimeout(() => {
            if (!isMountedRef.current) {
              return;
            }

            copiedFeedbackTimerRef.current = null;
            setCopiedMessageId(undefined);
          }, COPIED_FEEDBACK_DURATION_MS);
        })
        .catch((error) => {
          logger.error('Copy assistant message failed', error as Error);

          if (!isMountedRef.current || copyOperationId !== copyOperationIdRef.current) {
            return;
          }

          toast.show({ label: t('chat.messageActions.copyFailed'), variant: 'danger' });
        });
    },
    [t, toast],
  );

  const stateValue = useMemo(
    () => ({
      copiedMessageId,
      isAssistantToolbarEnabled,
      isDeleteDisabled,
      isRetryDisabled,
      retryableMessageIds,
    }),
    [
      copiedMessageId,
      isAssistantToolbarEnabled,
      isDeleteDisabled,
      isRetryDisabled,
      retryableMessageIds,
    ],
  );
  const actionsValue = useMemo(
    () => ({
      continueFromAnswer,
      copyAssistantMessage,
      deleteMessageTurn,
      forkFromAssistantMessage,
      retryAssistantMessage,
      selectBranch,
      shareAssistantMessage,
      stopAnswer,
    }),
    [
      continueFromAnswer,
      copyAssistantMessage,
      deleteMessageTurn,
      forkFromAssistantMessage,
      retryAssistantMessage,
      selectBranch,
      shareAssistantMessage,
      stopAnswer,
    ],
  );

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      copyOperationIdRef.current += 1;
      if (copiedFeedbackTimerRef.current !== null) {
        clearTimeout(copiedFeedbackTimerRef.current);
        copiedFeedbackTimerRef.current = null;
      }
    };
  }, []);

  return (
    <AssistantMessageActionsStateContext value={stateValue}>
      <AssistantMessageActionsContext value={actionsValue}>
        {children}
      </AssistantMessageActionsContext>
    </AssistantMessageActionsStateContext>
  );
}

export function useAssistantMessageActionsState() {
  const context = use(AssistantMessageActionsStateContext);

  if (!context) {
    throw new Error(
      'useAssistantMessageActionsState must be used within AssistantMessageActionsProvider',
    );
  }

  return context;
}

export function useAssistantMessageActions() {
  const context = use(AssistantMessageActionsContext);

  if (!context) {
    throw new Error(
      'useAssistantMessageActions must be used within AssistantMessageActionsProvider',
    );
  }

  return context;
}
