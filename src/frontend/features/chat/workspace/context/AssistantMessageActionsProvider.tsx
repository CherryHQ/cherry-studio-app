import { useAlert } from '@cherrystudio/ui/components';
import * as Clipboard from 'expo-clipboard';
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

import { useAgentSession } from '@/frontend/hooks/agent';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { useAgentChatFork } from '../../runtime';

const COPIED_FEEDBACK_DURATION_MS = 1_200;
/** Matches the Session title column, which the fork input also caps at 255. */
const SESSION_TITLE_MAX_LENGTH = 255;
const logger = loggerService.withContext('AssistantMessageActions');

type AssistantMessageActionsState = {
  copiedMessageId?: string;
  isAssistantToolbarEnabled: boolean;
};

type AssistantMessageActions = {
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
  sessionId: string;
}>;

export function AssistantMessageActionsProvider({
  children,
  isAssistantToolbarEnabled,
  sessionId,
}: AssistantMessageActionsProviderProps) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const forkSession = useAgentChatFork();
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

          alert.show({ title: t('chat.messageActions.copyFailed') });
        });
    },
    [alert, t],
  );

  const forkFromAssistantMessage = useCallback(
    ({ messageId }: { messageId: string }) => {
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

        alert.show({ title: t('chat.messageActions.forkFailed') });
      });
    },
    [alert, forkSession, sessionId, sourceTitle, t],
  );

  const stateValue = useMemo(
    () => ({ copiedMessageId, isAssistantToolbarEnabled }),
    [copiedMessageId, isAssistantToolbarEnabled],
  );
  const actionsValue = useMemo(
    () => ({ copyAssistantMessage, forkFromAssistantMessage }),
    [copyAssistantMessage, forkFromAssistantMessage],
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
