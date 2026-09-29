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

import { getSendErrorCodeLabelKey } from '../../ChatInput/utils/sendErrorLabel';

const COPIED_FEEDBACK_DURATION_MS = 1_200;
/** Matches the Session title column, which the fork input also caps at 255. */
const SESSION_TITLE_MAX_LENGTH = 255;
const logger = loggerService.withContext('AssistantMessageActions');

type AssistantMessageActionsState = {
  copiedMessageId?: string;
  isAssistantToolbarEnabled: boolean;
  /** A running turn owns the transcript; its rows must not disappear underneath it. */
  isDeleteDisabled: boolean;
  isRetryDisabled: boolean;
  /** The Session's latest answer, the only one retry may replace. */
  retryableMessageId?: string;
};

type AssistantMessageActions = {
  retryAssistantMessage?: (input: { messageId: string }) => void;
  shareAssistantMessage: (input: { messageId: string }) => void;
  copyAssistantMessage: (input: { messageId: string; text: string }) => void;
  /** Copies the transcript up to this message into a new chat and opens it. */
  forkFromAssistantMessage?: (input: { messageId: string }) => void;
  deleteMessageTurn?: (input: { turnId: string }) => void;
};

const AssistantMessageActionsStateContext = createContext<AssistantMessageActionsState | null>(
  null,
);
const AssistantMessageActionsContext = createContext<AssistantMessageActions | null>(null);

type AssistantMessageActionsProviderProps = PropsWithChildren<{
  isAssistantToolbarEnabled: boolean;
  retryableMessageId?: string;
  /** Opens the source-owned share selector; absent while no Session exists. */
  onShare?: (messageId: string) => void;
  snapshot: ConversationSnapshot;
  messages: readonly ConversationMessage[];
}>;

export function AssistantMessageActionsProvider({
  children,
  isAssistantToolbarEnabled,
  retryableMessageId,
  onShare,
  snapshot,
  messages,
}: AssistantMessageActionsProviderProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { alert } = useAlert();
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
  const retryMessage = messages.find((message) => message.key === retryableMessageId);
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
    onShare,
    retryableMessageId,
    snapshot,
    t,
    toast,
  });
  useLayoutEffect(() => {
    latest.current = { alert, isBusy, messages, onShare, retryableMessageId, snapshot, t, toast };
  });

  const run = useCallback(
    async <Input, Output>(
      key: string,
      action: ConversationAction<Input, Output> | undefined,
      value: Input,
      errorLabel: 'retryFailed' | 'forkFailed' | 'deleteFailed',
      applied?: (result: Output) => void,
    ) => {
      if (!action || action.availability.state !== 'enabled' || inFlight.current.has(key)) return;
      inFlight.current.add(key);
      try {
        const outcome = await action.execute(value);
        if (!mounted.current) return;
        const { t: translate, toast: currentToast } = latest.current;
        if (outcome.state === 'applied') applied?.(outcome.value);
        else if (outcome.state === 'rejected' || outcome.state === 'interrupted')
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
  const share = useCallback(({ messageId }: { messageId: string }) => {
    const { onShare: openShare } = latest.current;
    if (!openShare || sharing.current) return;
    sharing.current = true;
    Keyboard.dismiss();
    openShare(messageId);
  }, []);
  const retry = useCallback(
    ({ messageId }: { messageId: string }) => {
      const current = latest.current;
      if (messageId !== current.retryableMessageId || current.isBusy) return;
      const action = current.messages.find((message) => message.key === messageId)?.actions.retry;
      void run(`retry:${messageId}`, action, undefined, 'retryFailed');
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
  return (
    <ChatMessageActionsProvider
      isAssistantToolbarEnabled={isAssistantToolbarEnabled}
      onShare={share}
      onFork={messages.some((message) => message.actions.fork) ? fork : undefined}
      onDelete={messages.some((message) => message.actions.remove) ? remove : undefined}
      onRetry={retryMessage?.actions.retry ? retry : undefined}
      isDeleteDisabled={isBusy}
      isRetryDisabled={isBusy || retryMessage?.actions.retry?.availability.state !== 'enabled'}
      retryableMessageId={retryableMessageId}
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
  isDeleteDisabled = true,
  isRetryDisabled = true,
  retryableMessageId,
}: PropsWithChildren<{
  isAssistantToolbarEnabled: boolean;
  onShare: AssistantMessageActions['shareAssistantMessage'];
  onFork?: AssistantMessageActions['forkFromAssistantMessage'];
  onDelete?: AssistantMessageActions['deleteMessageTurn'];
  onRetry?: AssistantMessageActions['retryAssistantMessage'];
  isDeleteDisabled?: boolean;
  isRetryDisabled?: boolean;
  retryableMessageId?: string;
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
      ...(retryableMessageId ? { retryableMessageId } : {}),
    }),
    [
      copiedMessageId,
      isAssistantToolbarEnabled,
      isDeleteDisabled,
      isRetryDisabled,
      retryableMessageId,
    ],
  );
  const actionsValue = useMemo(
    () => ({
      copyAssistantMessage,
      deleteMessageTurn,
      forkFromAssistantMessage,
      retryAssistantMessage,
      shareAssistantMessage,
    }),
    [
      copyAssistantMessage,
      deleteMessageTurn,
      forkFromAssistantMessage,
      retryAssistantMessage,
      shareAssistantMessage,
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
