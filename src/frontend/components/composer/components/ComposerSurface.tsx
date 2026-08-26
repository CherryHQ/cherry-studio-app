import { Composer, useToast } from '@cherrystudio/ui/components';
import { type PropsWithChildren, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardController } from 'react-native-keyboard-controller';

import { loggerService } from '@/shared/core/logger/LoggerService';

import { useComposerActions, useComposerState } from '../context/ComposerProvider';
import {
  type ComposerAttachmentReady,
  hasComposerSendableContent,
  hasImportingComposerAttachments,
  isComposerAttachmentReady,
} from '../utils/composerAttachments';

const logger = loggerService.withContext('ComposerSurface');

export type ComposerSendPayload = {
  attachments: readonly ComposerAttachmentReady[];
  text: string;
};

type ComposerSurfaceProps = PropsWithChildren<{
  /** Omit for the default: there is text, or there is an attachment. */
  canSend?: boolean;
  dismissKeyboardOnSend?: boolean;
  /** A message for a failure the caller recognises; `undefined` falls back. */
  getSendErrorLabel?: (error: unknown) => string | undefined;
  onSend: (payload: ComposerSendPayload) => Promise<void>;
  onStop: () => void;
  streaming: boolean;
}>;

/**
 * The composer root, and the one piece of it that is not pluggable. Everything
 * inside is the caller's to arrange, but sending is a protocol rather than a
 * part — trim, clear before awaiting, restore the draft *and* the attachments
 * if it rejects, toast, log — and two screens assembling that separately is two
 * implementations of it. Since this is what renders the surface, there is no
 * way to compose a composer that skips it.
 */
export function ComposerSurface({
  canSend,
  children,
  dismissKeyboardOnSend = true,
  getSendErrorLabel,
  onSend,
  onStop,
  streaming,
}: ComposerSurfaceProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { attachments, draft } = useComposerState();
  const { clearAttachments, setAttachments, setDraft } = useComposerActions();
  const activeSendAttemptIdRef = useRef<number | null>(null);
  const nextSendAttemptIdRef = useRef(0);

  const handleSend = useCallback(async () => {
    if (activeSendAttemptIdRef.current !== null) {
      logger.debug('Ignored duplicate message send', {
        attemptId: activeSendAttemptIdRef.current,
      });
      return;
    }

    const attachmentSnapshot = attachments.filter(isComposerAttachmentReady);
    if (attachmentSnapshot.length !== attachments.length) {
      logger.warn('Ignored message send with attachments that are not ready');
      toast.show({ label: t('chat.input.sendFailed'), variant: 'danger' });
      return;
    }

    const attemptId = ++nextSendAttemptIdRef.current;
    activeSendAttemptIdRef.current = attemptId;
    logger.debug('Message send started', { attemptId });

    const draftSnapshot = draft;

    setDraft('');
    clearAttachments();
    if (dismissKeyboardOnSend) {
      // Not animated: an animated dismissal races the message list's
      // scroll-to-bottom and the two fight over the same pixels.
      void KeyboardController.dismiss({ animated: false });
    }

    try {
      await onSend({ attachments: attachmentSnapshot, text: draftSnapshot.trim() });
    } catch (error) {
      // The toast is deliberately vague, so without this the failure leaves no
      // trace at all and there is nothing to go on when a send breaks on device.
      logger.error('Message send failed', error instanceof Error ? error : { error }, {
        attemptId,
      });
      setDraft(draftSnapshot);
      setAttachments(attachmentSnapshot);
      toast.show({
        label: getSendErrorLabel?.(error) ?? t('chat.input.sendFailed'),
        variant: 'danger',
      });
    } finally {
      activeSendAttemptIdRef.current = null;
      logger.debug('Message send finished', { attemptId });
    }
  }, [
    attachments,
    clearAttachments,
    dismissKeyboardOnSend,
    draft,
    getSendErrorLabel,
    onSend,
    setAttachments,
    setDraft,
    t,
    toast,
  ]);

  return (
    <Composer
      canSend={
        !hasImportingComposerAttachments(attachments) &&
        (canSend ?? hasComposerSendableContent(draft, attachments))
      }
      labels={{
        send: t('chat.input.action.sendMessage'),
        stop: t('chat.input.action.stopGenerating'),
      }}
      onChangeText={setDraft}
      onSend={handleSend}
      onStop={onStop}
      streaming={streaming}
      value={draft}
    >
      {children}
    </Composer>
  );
}
