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

import { useAlert } from '@/frontend/components/AlertProvider';
import { loggerService } from '@/shared/core/logger/LoggerService';

const COPIED_FEEDBACK_DURATION_MS = 1_200;
const logger = loggerService.withContext('AssistantMessageActions');

type AssistantMessageActionState = {
  copiedMessageId?: string;
  isRegenerateDisabled: boolean;
};

type AssistantMessageActionCommands = {
  copyAssistantMessage: (input: { messageId: string; text: string }) => void;
  regenerateAssistantMessage: (messageId: string) => void;
};

const AssistantMessageActionStateContext = createContext<AssistantMessageActionState | null>(null);
const AssistantMessageActionCommandsContext = createContext<AssistantMessageActionCommands | null>(
  null,
);

type AssistantMessageActionsProviderProps = PropsWithChildren<{
  isRegenerateDisabled: boolean;
  onRegenerate: (input: { messageId: string }) => Promise<unknown>;
}>;

export function AssistantMessageActionsProvider({
  children,
  isRegenerateDisabled,
  onRegenerate,
}: AssistantMessageActionsProviderProps) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const [copiedMessageId, setCopiedMessageId] = useState<string>();
  const copiedFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyOperationIdRef = useRef(0);
  const eventDependenciesRef = useRef({ alert, onRegenerate, t });
  const isMountedRef = useRef(true);

  useEffect(() => {
    eventDependenciesRef.current = { alert, onRegenerate, t };
  }, [alert, onRegenerate, t]);

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
          if (!isMountedRef.current || copyOperationId !== copyOperationIdRef.current) {
            return;
          }

          const { alert: currentAlert, t: currentT } = eventDependenciesRef.current;
          logger.error('Copy assistant message failed', error as Error);
          currentAlert.show({ title: currentT('chat.messageActions.copyFailed') });
        });
    },
    [],
  );

  const regenerateAssistantMessage = useCallback((messageId: string) => {
    const {
      alert: currentAlert,
      onRegenerate: currentOnRegenerate,
      t: currentT,
    } = eventDependenciesRef.current;
    void currentOnRegenerate({ messageId }).catch((error) => {
      if (!isMountedRef.current) {
        return;
      }

      logger.error('Regenerate assistant message failed', error as Error);
      currentAlert.show({ title: currentT('chat.messageActions.regenerateFailed') });
    });
  }, []);

  const stateValue = useMemo(
    () => ({ copiedMessageId, isRegenerateDisabled }),
    [copiedMessageId, isRegenerateDisabled],
  );
  const commandsValue = useMemo(
    () => ({ copyAssistantMessage, regenerateAssistantMessage }),
    [copyAssistantMessage, regenerateAssistantMessage],
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
    <AssistantMessageActionStateContext value={stateValue}>
      <AssistantMessageActionCommandsContext value={commandsValue}>
        {children}
      </AssistantMessageActionCommandsContext>
    </AssistantMessageActionStateContext>
  );
}

export function useAssistantMessageActionState() {
  const context = use(AssistantMessageActionStateContext);

  if (!context) {
    throw new Error(
      'useAssistantMessageActionState must be used within AssistantMessageActionsProvider',
    );
  }

  return context;
}

export function useAssistantMessageActionCommands() {
  const context = use(AssistantMessageActionCommandsContext);

  if (!context) {
    throw new Error(
      'useAssistantMessageActionCommands must be used within AssistantMessageActionsProvider',
    );
  }

  return context;
}
