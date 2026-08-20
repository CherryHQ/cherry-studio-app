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

import { loggerService } from '@/shared/core/logger/LoggerService';

const COPIED_FEEDBACK_DURATION_MS = 1_200;
const logger = loggerService.withContext('AssistantMessageActions');

type AssistantMessageActionsState = {
  copiedMessageId?: string;
  isAssistantToolbarEnabled: boolean;
  isRegenerateDisabled: boolean;
};

type AssistantMessageActions = {
  copyAssistantMessage: (input: { messageId: string; text: string }) => void;
  regenerateAssistantMessage: (messageId: string) => void;
};

const AssistantMessageActionsStateContext = createContext<AssistantMessageActionsState | null>(
  null,
);
const AssistantMessageActionsContext = createContext<AssistantMessageActions | null>(null);

type AssistantMessageActionsProviderProps = PropsWithChildren<{
  isAssistantToolbarEnabled: boolean;
  isRegenerateDisabled: boolean;
  onRegenerate: (input: { messageId: string }) => Promise<unknown>;
}>;

export function AssistantMessageActionsProvider({
  children,
  isAssistantToolbarEnabled,
  isRegenerateDisabled,
  onRegenerate,
}: AssistantMessageActionsProviderProps) {
  const { t } = useTranslation();
  const { alert } = useAlert();
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

  const regenerateAssistantMessage = useCallback(
    (messageId: string) => {
      void onRegenerate({ messageId }).catch((error) => {
        logger.error('Regenerate assistant message failed', error as Error);

        if (!isMountedRef.current) {
          return;
        }

        alert.show({ title: t('chat.messageActions.regenerateFailed') });
      });
    },
    [alert, onRegenerate, t],
  );

  const stateValue = useMemo(
    () => ({ copiedMessageId, isAssistantToolbarEnabled, isRegenerateDisabled }),
    [copiedMessageId, isAssistantToolbarEnabled, isRegenerateDisabled],
  );
  const actionsValue = useMemo(
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
