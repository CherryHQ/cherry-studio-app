import { useToast } from '@cherrystudio/ui/components';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard } from 'react-native';

import { useAgentSession } from '@/frontend/hooks/agent';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { useAgentChatBusy, useAgentChatFork, useAgentChatRetry } from '../../../runtime';
import { getSendErrorLabelKey } from '../../ChatInput/utils/sendErrorLabel';

const COPIED_FEEDBACK_DURATION_MS = 1_200;
/** Matches the Session title column, which the fork input also caps at 255. */
const SESSION_TITLE_MAX_LENGTH = 255;
const logger = loggerService.withContext('AssistantMessageActions');

type AssistantMessageActionsState = {
  copiedMessageId?: string;
  isAssistantToolbarEnabled: boolean;
  isRetryDisabled: boolean;
  /** The Session's latest answer, the only one retry may replace. */
  retryableMessageId?: string;
};

type AssistantMessageActions = {
  retryAssistantMessage: (input: { messageId: string }) => void;
  shareAssistantMessage: (input: { messageId: string }) => void;
  copyAssistantMessage: (input: { messageId: string; text: string }) => void;
  /** Copies the transcript up to this message into a new chat and opens it. */
  forkFromAssistantMessage: (input: { messageId: string }) => void;
};

const AssistantMessageActionsStateContext = createContext<AssistantMessageActionsState | null>(
  null,
);
const AssistantMessageActionsContext = createContext<AssistantMessageActions | null>(null);

type AssistantMessageActionsProviderProps = PropsWithChildren<{
  isAssistantToolbarEnabled: boolean;
  retryableMessageId?: string;
  sessionId?: string;
}>;

export function AssistantMessageActionsProvider({
  children,
  isAssistantToolbarEnabled,
  retryableMessageId,
  sessionId,
}: AssistantMessageActionsProviderProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const forkSession = useAgentChatFork();
  const retryMessage = useAgentChatRetry();
  const isSessionBusy = useAgentChatBusy(sessionId);
  const retryInFlightRef = useRef(false);
  const currentSessionRef = useRef(sessionId);
  useEffect(() => {
    currentSessionRef.current = sessionId;
    return () => {
      currentSessionRef.current = undefined;
    };
  }, [sessionId]);
  const shareNavigationInFlightRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      // The chat screen remains mounted underneath the selector. Unlock only when
      // it regains focus so rapid taps cannot push duplicate selector routes.
      shareNavigationInFlightRef.current = false;
    }, []),
  );
  const shareAssistantMessage = useCallback(
    ({ messageId }: { messageId: string }) => {
      if (!sessionId || shareNavigationInFlightRef.current) return;
      shareNavigationInFlightRef.current = true;
      Keyboard.dismiss();
      router.push({ pathname: '/chat-share', params: { sessionId, messageId } });
    },
    [sessionId, shareNavigationInFlightRef],
  );
  // Already in cache: the chat screen resolves this same Session to render.
  const sourceTitle = useAgentSession(sessionId).data?.title?.trim();
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

  const forkFromAssistantMessage = useCallback(
    ({ messageId }: { messageId: string }) => {
      if (!sessionId) {
        return;
      }
      // An unnamed source stays unnamed, so the fork keeps the empty title that
      // lets auto-naming name it from its own first message. A prefix alone
      // would block that forever.
      const title = sourceTitle
        ? t('chat.fork.sessionTitle', { title: sourceTitle }).slice(0, SESSION_TITLE_MAX_LENGTH)
        : undefined;

      void forkSession({ fromMessageId: messageId, sessionId, title }).catch((error) => {
        logger.error('Fork assistant message failed', error as Error);

        if (!isMountedRef.current) {
          return;
        }

        toast.show({ label: t('chat.messageActions.forkFailed'), variant: 'danger' });
      });
    },
    [forkSession, sessionId, sourceTitle, t, toast],
  );

  const retryAssistantMessage = useCallback(
    ({ messageId }: { messageId: string }) => {
      if (!sessionId || retryInFlightRef.current || isSessionBusy) return;
      retryInFlightRef.current = true;
      void retryMessage({ sessionId, messageId })
        .catch((error: unknown) => {
          logger.error('Retry assistant message failed', error as Error);
          if (currentSessionRef.current === sessionId) {
            toast.show({
              label: t(getSendErrorLabelKey(error) ?? 'chat.messageActions.retryFailed'),
              variant: 'danger',
            });
          }
        })
        .finally(() => {
          retryInFlightRef.current = false;
        });
    },
    [isSessionBusy, retryMessage, sessionId, t, toast],
  );

  const stateValue = useMemo(
    () => ({
      copiedMessageId,
      isAssistantToolbarEnabled,
      isRetryDisabled: isSessionBusy || !sessionId,
      ...(retryableMessageId ? { retryableMessageId } : {}),
    }),
    [copiedMessageId, isAssistantToolbarEnabled, isSessionBusy, retryableMessageId, sessionId],
  );
  const actionsValue = useMemo(
    () => ({
      copyAssistantMessage,
      forkFromAssistantMessage,
      retryAssistantMessage,
      shareAssistantMessage,
    }),
    [copyAssistantMessage, forkFromAssistantMessage, retryAssistantMessage, shareAssistantMessage],
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
