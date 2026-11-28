import { Composer, useComposerExpansion, useToast } from '@cherrystudio/ui/components';
import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { useTranslation } from 'react-i18next';

import { loggerService } from '@/shared/core/logger/LoggerService';

import {
  useComposerActions,
  useComposerMeta,
  useComposerPresentationActions,
  useComposerState,
} from '../context/ComposerProvider';
import { useComposerSendError } from '../hooks/useComposerSendError';
import {
  type ComposerAttachmentReady,
  hasComposerSendableContent,
  hasImportingComposerAttachments,
  isComposerAttachmentReady,
} from '../utils/composerAttachments';

const logger = loggerService.withContext('ComposerSurface');
const ComposerSubmitContext = createContext<((markdown: string) => Promise<void>) | null>(null);

/** The same guarded submission used by the surface's send button. */
export function useComposerSubmit() {
  const submit = use(ComposerSubmitContext);
  if (!submit) throw new Error('useComposerSubmit must be rendered inside a ComposerSurface');
  return submit;
}

export type ComposerSendPayload = {
  attachments: readonly ComposerAttachmentReady[];
  text: string;
};

type ComposerSurfaceProps = PropsWithChildren<{
  /** Remote services can require confirmed admission before text leaves the field. */
  sendPolicy?: 'optimistic' | 'confirmed';
  /** Chat can queue a follow-up while the current answer streams. */
  allowFollowUp?: boolean;
  /** Omit for the default: there is text, or there is an attachment. */
  canSend?: boolean;
  dismissKeyboardOnSend?: boolean;
  /** A message for a failure the caller recognises; `undefined` falls back. */
  getSendErrorLabel?: (error: unknown) => string | undefined;
  labels?: {
    send: string;
    sendFailed: string;
    stop: string;
  };
  onSend: (payload: ComposerSendPayload) => Promise<void>;
  onStop: () => void;
  streaming: boolean;
  testID?: string;
}>;

/**
 * The composer root owns sending. Callers arrange the content while the surface applies the
 * admission policy, preserves newer edits, and reports the outcome.
 */
export function ComposerSurface({
  sendPolicy = 'optimistic',
  allowFollowUp = false,
  canSend,
  children,
  dismissKeyboardOnSend = true,
  getSendErrorLabel,
  labels,
  onSend,
  onStop,
  streaming,
  testID,
}: ComposerSurfaceProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const expansion = useComposerExpansion();
  const collapseEditor = expansion?.actions.collapse;
  const reportSendError = useComposerSendError({
    getSendErrorLabel,
    sendFailedLabel: labels?.sendFailed,
  });
  const { failedSend, isFocused } = useComposerMeta();
  useLayoutEffect(() => {
    if (!failedSend || !isFocused) return;
    const report = () => {
      const failure = failedSend.get();
      if (!failure) return;
      failedSend.set(undefined);
      reportSendError(failure.error, failure.attemptId);
    };
    const unsubscribe = failedSend.subscribe(report);
    report();
    return unsubscribe;
  }, [failedSend, isFocused, reportSendError]);
  const { attachments, draft, isSubmitting } = useComposerState();
  const {
    restoreAttachments,
    beginSendAttempt,
    clearAttachments,
    editDraft,
    endSendAttempt,
    removeAttachment,
    setDraft,
  } = useComposerActions();
  const { dismissInput } = useComposerPresentationActions();
  const hasContent = hasComposerSendableContent(draft, attachments);
  const isStopOnly = streaming && !allowFollowUp;
  const isSendable =
    !isSubmitting && !hasImportingComposerAttachments(attachments) && (canSend ?? hasContent);
  // The composer's actions must not change with what was typed (see CherryUI's `Composer`), and
  // callers rebuild their handlers on every update, so the handlers read these when invoked.
  const latest = useRef({ attachments, canSend, draft, isSubmitting, isStopOnly, onSend, onStop });
  useLayoutEffect(() => {
    latest.current = { attachments, canSend, draft, isSubmitting, isStopOnly, onSend, onStop };
  });

  const handleSend = useCallback(
    async (nativeDraft?: string) => {
      const { attachments, draft, onSend } = latest.current;
      const attachmentSnapshot = attachments.filter(isComposerAttachmentReady);
      if (attachmentSnapshot.length !== attachments.length) {
        logger.warn('Ignored message send with attachments that are not ready');
        toast.show({ label: labels?.sendFailed ?? t('chat.input.sendFailed'), variant: 'danger' });
        return;
      }

      const attemptId = beginSendAttempt();
      if (attemptId === null) {
        logger.debug('Ignored duplicate message send');
        return;
      }

      const draftSnapshot = nativeDraft ?? draft;

      if (sendPolicy === 'optimistic') {
        setDraft('');
        clearAttachments();
        collapseEditor?.();
        if (dismissKeyboardOnSend) dismissInput();
      }

      try {
        await onSend({ attachments: attachmentSnapshot, text: draftSnapshot.trim() });
        if (sendPolicy === 'confirmed') {
          setDraft((current) => (current === draftSnapshot ? '' : current));
          for (const attachment of attachmentSnapshot) removeAttachment(attachment.id);
          collapseEditor?.();
          if (dismissKeyboardOnSend) dismissInput();
        }
      } catch (error) {
        if (sendPolicy === 'optimistic') {
          setDraft((current) =>
            current ? [draftSnapshot, current].filter(Boolean).join('\n') : draftSnapshot,
          );
          restoreAttachments(attachmentSnapshot);
        }
        if (failedSend) failedSend.set({ error, attemptId });
        else reportSendError(error, attemptId);
      } finally {
        endSendAttempt();
      }
    },
    [
      beginSendAttempt,
      clearAttachments,
      collapseEditor,
      dismissInput,
      dismissKeyboardOnSend,
      endSendAttempt,
      failedSend,
      reportSendError,
      removeAttachment,
      labels?.sendFailed,
      restoreAttachments,
      setDraft,
      sendPolicy,
      t,
      toast,
    ],
  );
  const handleReturnSubmit = useCallback(
    async (markdown: string) => {
      const { attachments, canSend, isSubmitting, isStopOnly } = latest.current;
      if (
        !isStopOnly &&
        !isSubmitting &&
        !hasImportingComposerAttachments(attachments) &&
        (canSend ?? hasComposerSendableContent(markdown, attachments))
      ) {
        await handleSend(markdown);
      }
    },
    [handleSend],
  );
  const handleStop = useCallback(() => latest.current.onStop(), []);
  const sendLabel = labels?.send ?? t('chat.input.action.sendMessage');
  const stopLabel = labels?.stop ?? t('chat.input.action.stopGenerating');
  const composerLabels = useMemo(
    () => ({ send: sendLabel, stop: stopLabel }),
    [sendLabel, stopLabel],
  );

  return (
    <ComposerSubmitContext value={handleReturnSubmit}>
      <Composer
        canSend={isSendable}
        labels={composerLabels}
        onChangeText={editDraft}
        onSend={handleSend}
        onStop={handleStop}
        streaming={isStopOnly || (streaming && !hasContent)}
        testID={testID}
        value={draft}
      >
        {children}
      </Composer>
    </ComposerSubmitContext>
  );
}
