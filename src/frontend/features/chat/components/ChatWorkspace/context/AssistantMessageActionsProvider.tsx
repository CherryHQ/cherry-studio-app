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
import { ModelPickerDrawer, type ModelPickerModelItem } from '@/frontend/components/ModelPicker';
import { useModelChoice } from '@/frontend/components/Policy';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { editReplyHref } from '../../../editReply/editReplyRoute';
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
  /** Answers that can be regenerated, retried, or answered again with another model. */
  retryableMessageIds: ReadonlySet<string>;
  editableMessageIds: ReadonlySet<string>;
  isEditDisabled: boolean;
};

type AssistantMessageActions = {
  editAssistantMessage?: (input: { messageId: string }) => void;
  retryAssistantMessage?: (input: { messageId: string }) => void;
  shareAssistantMessage: (input: { messageId: string }) => void;
  copyAssistantMessage: (input: { messageId: string; text: string }) => void;
  /** Copies the transcript up to this message into a new chat and opens it. */
  forkFromAssistantMessage?: (input: { messageId: string }) => void;
  deleteMessageTurn?: (input: { turnId: string }) => void;
  /**
   * Shows another alternative at a branch point, restoring its own continuation. Resolves whether
   * the choice was applied.
   */
  selectBranch?: (input: { messageId: string; targetId: string }) => Promise<boolean>;
  /** Chooses a model that adds one more answer to this answer's question. */
  answerWithModel?: (input: { messageId: string }) => void;
};

const AssistantMessageActionsStateContext = createContext<AssistantMessageActionsState | null>(
  null,
);
const AssistantMessageActionsContext = createContext<AssistantMessageActions | null>(null);

type AssistantMessageActionsProviderProps = PropsWithChildren<{
  isAssistantToolbarEnabled: boolean;
  /** Opens the source-owned share selector; absent while no Session exists. */
  onShare?: (messageId: string, translations?: ChatShareTranslations) => void;
  /** The local Session whose answers open in the reply editor. */
  sessionId?: string;
  snapshot: ConversationSnapshot;
  messages: readonly ConversationMessage[];
}>;

export function AssistantMessageActionsProvider({
  children,
  isAssistantToolbarEnabled,
  onShare,
  sessionId,
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
  // The answer whose question the model picker adds an answer to.
  const [answeringMessageId, setAnsweringMessageId] = useState<string>();
  const { isLocked: isModelLocked } = useModelChoice();
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
  const editableKey = messages
    .filter((message) => message.actions.edit)
    .map((message) => message.key)
    .join('\n');
  const editableMessageIds = useMemo(
    () => new Set(editableKey ? editableKey.split('\n') : []),
    [editableKey],
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
    onShare,
    snapshot,
    t,
    toast,
  });
  useLayoutEffect(() => {
    latest.current = { alert, isBusy, messages, onShare, snapshot, t, toast };
  });

  const run = useCallback(
    async <Input, Output>(
      key: string,
      action: ConversationAction<Input, Output> | undefined,
      value: Input,
      errorLabel: 'retryFailed' | 'forkFailed' | 'deleteFailed' | 'branchFailed',
      applied?: (result: Output) => void,
    ) => {
      if (!action || action.availability.state !== 'enabled' || inFlight.current.has(key))
        return false;
      inFlight.current.add(key);
      try {
        const outcome = await action.execute(value);
        if (!mounted.current) return false;
        const { t: translate, toast: currentToast } = latest.current;
        if (outcome.state === 'applied') {
          applied?.(outcome.value);
          return true;
        }
        // A retry the user stopped before its turn was reserved did not fail.
        if (
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
        return false;
      } catch (error) {
        logger.error('Conversation message action failed', error as Error);
        if (mounted.current)
          latest.current.toast.show({
            label: latest.current.t(`chat.messageActions.${errorLabel}`),
            variant: 'danger',
          });
        return false;
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
  const edit = useCallback(
    ({ messageId }: { messageId: string }) => {
      const current = latest.current;
      const message = current.messages.find((message) => message.key === messageId);
      if (!sessionId || current.isBusy || message?.actions.edit?.availability.state !== 'enabled')
        return;
      Keyboard.dismiss();
      router.push(editReplyHref({ sessionId, messageId }));
    },
    [sessionId],
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
      // Keyed by target too: a quick second choice is the one the reader wants, not a duplicate.
      return run(
        `select:${messageId}:${targetId}`,
        action,
        { messageId: targetId },
        'branchFailed',
      );
    },
    [run],
  );
  const answerWithModel = useCallback(({ messageId }: { messageId: string }) => {
    if (!latest.current.isBusy) setAnsweringMessageId(messageId);
  }, []);
  const closeAnswerModelPicker = useCallback(() => setAnsweringMessageId(undefined), []);
  const answerWith = useCallback(
    (item: ModelPickerModelItem) => {
      const messageId = answeringMessageId;
      setAnsweringMessageId(undefined);
      const current = latest.current;
      if (!messageId || current.isBusy) return;
      const action = current.messages.find((message) => message.key === messageId)?.actions
        .answerWith;
      void run(`answer:${messageId}`, action, { modelId: item.modelId }, 'retryFailed');
    },
    [answeringMessageId, run],
  );
  const answeringMessage = answeringMessageId
    ? messages.find((message) => message.key === answeringMessageId)
    : undefined;
  return (
    <ChatMessageActionsProvider
      isAssistantToolbarEnabled={isAssistantToolbarEnabled}
      onShare={share}
      onEdit={editableMessageIds.size ? edit : undefined}
      editableMessageIds={editableMessageIds}
      isEditDisabled={
        isBusy ||
        messages.some(
          (message) =>
            message.actions.edit && message.actions.edit.availability.state !== 'enabled',
        )
      }
      onFork={messages.some((message) => message.actions.fork) ? fork : undefined}
      onDelete={messages.some((message) => message.actions.remove) ? remove : undefined}
      onRetry={retryableMessageIds.size ? retry : undefined}
      onSelectBranch={messages.some((message) => message.actions.select) ? selectBranch : undefined}
      onAnswerWithModel={
        // A model scope with one model leaves no other model to answer with.
        !isModelLocked && messages.some((message) => message.actions.answerWith)
          ? answerWithModel
          : undefined
      }
      isDeleteDisabled={isBusy}
      isRetryDisabled={isBusy}
      retryableMessageIds={retryableMessageIds}
    >
      {children}
      {answeringMessage ? (
        <ModelPickerDrawer
          modelType="text"
          onClose={closeAnswerModelPicker}
          onSelect={answerWith}
          open
          selectedModelId={answeringMessage.display.model?.id ?? null}
          title={t('chat.messageActions.answerWith')}
          variant="chat"
        />
      ) : null}
    </ChatMessageActionsProvider>
  );
}

/** Presentation actions shared by local and PC-owned conversations. */
export function ChatMessageActionsProvider({
  children,
  isAssistantToolbarEnabled,
  onShare: shareAssistantMessage,
  onEdit: editAssistantMessage,
  onFork: forkFromAssistantMessage,
  onDelete: deleteMessageTurn,
  onRetry: retryAssistantMessage,
  onSelectBranch: selectBranch,
  onAnswerWithModel: answerWithModel,
  isDeleteDisabled = true,
  isRetryDisabled = true,
  retryableMessageIds = EMPTY_MESSAGE_IDS,
  editableMessageIds = EMPTY_MESSAGE_IDS,
  isEditDisabled = true,
}: PropsWithChildren<{
  isAssistantToolbarEnabled: boolean;
  onShare: AssistantMessageActions['shareAssistantMessage'];
  onEdit?: AssistantMessageActions['editAssistantMessage'];
  onFork?: AssistantMessageActions['forkFromAssistantMessage'];
  onDelete?: AssistantMessageActions['deleteMessageTurn'];
  onRetry?: AssistantMessageActions['retryAssistantMessage'];
  onSelectBranch?: AssistantMessageActions['selectBranch'];
  onAnswerWithModel?: AssistantMessageActions['answerWithModel'];
  isDeleteDisabled?: boolean;
  isRetryDisabled?: boolean;
  retryableMessageIds?: ReadonlySet<string>;
  editableMessageIds?: ReadonlySet<string>;
  isEditDisabled?: boolean;
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
      editableMessageIds,
      isEditDisabled,
    }),
    [
      copiedMessageId,
      isAssistantToolbarEnabled,
      isDeleteDisabled,
      isRetryDisabled,
      retryableMessageIds,
      editableMessageIds,
      isEditDisabled,
    ],
  );
  const actionsValue = useMemo(
    () => ({
      answerWithModel,
      editAssistantMessage,
      copyAssistantMessage,
      deleteMessageTurn,
      forkFromAssistantMessage,
      retryAssistantMessage,
      selectBranch,
      shareAssistantMessage,
    }),
    [
      answerWithModel,
      editAssistantMessage,
      copyAssistantMessage,
      deleteMessageTurn,
      forkFromAssistantMessage,
      retryAssistantMessage,
      selectBranch,
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
