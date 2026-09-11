import { Button, Composer, useToast } from '@cherrystudio/ui/components';
import { type PropsWithChildren, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  fileAttachmentIssueDescription,
  getFileAttachmentIssue,
} from '@/frontend/utils/fileAttachmentFeedback';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { useComposerActions, useComposerMeta, useComposerState } from '../context/ComposerProvider';
import {
  type ComposerAttachmentReady,
  hasComposerSendableContent,
  hasUnreadyComposerAttachments,
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

/** Owns submission, one-at-a-time admission, and revision-safe draft recovery. */
export function ComposerSurface({
  canSend,
  children,
  getSendErrorLabel,
  labels,
  onSend,
  onStop,
  streaming,
  testID,
}: ComposerSurfaceProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { contentRevision } = useComposerMeta();
  const { attachments, draft } = useComposerState();
  const { addAttachments, clearAttachments, setAttachments, setDraft } = useComposerActions();
  const activeSendAttemptIdRef = useRef<number | null>(null);
  const nextSendAttemptIdRef = useRef(0);
  const mounted = useRef(true);
  const [failedDrafts, setFailedDrafts] = useState<(ComposerSendPayload & { id: number })[]>([]);
  const [replacement, setReplacement] = useState<{ id: number; revision: number }>();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const handleSend = useCallback(async () => {
    if (activeSendAttemptIdRef.current !== null) {
      logger.debug('Ignored duplicate message send', {
        attemptId: activeSendAttemptIdRef.current,
      });
      return;
    }

    if (streaming || !(canSend ?? hasComposerSendableContent(draft, attachments))) return;
    const attachmentSnapshot = attachments.filter(isComposerAttachmentReady);
    if (attachmentSnapshot.length !== attachments.length) {
      logger.warn('Ignored message send with attachments that are not ready');
      toast.show({ label: labels?.sendFailed ?? t('chat.input.sendFailed'), variant: 'danger' });
      return;
    }

    const attemptId = ++nextSendAttemptIdRef.current;
    activeSendAttemptIdRef.current = attemptId;

    const draftSnapshot = draft;

    setDraft('');
    clearAttachments();
    const clearedRevision = contentRevision.current;

    try {
      await onSend({ attachments: attachmentSnapshot, text: draftSnapshot.trim() });
    } catch (error) {
      const issue = getFileAttachmentIssue(error);
      const explainedLabel = issue
        ? fileAttachmentIssueDescription(issue, t)
        : getSendErrorLabel?.(error);
      // Preserve diagnostics independently of the nonmodal user feedback.
      // Explained rejections stay below the development error-overlay level.
      const errorDetail = error instanceof Error ? error : { error };
      if (explainedLabel) {
        logger.warn('Message send rejected', errorDetail, { attemptId });
      } else {
        logger.error('Message send failed', errorDetail, { attemptId });
      }
      if (!mounted.current) return;
      if (contentRevision.current === clearedRevision) {
        setDraft(draftSnapshot);
        addAttachments([...attachmentSnapshot]);
      } else {
        setFailedDrafts((current) => [
          ...current,
          { id: attemptId, text: draftSnapshot, attachments: attachmentSnapshot },
        ]);
      }
      toast.show({
        label: explainedLabel ?? labels?.sendFailed ?? t('chat.input.sendFailed'),
        variant: 'danger',
      });
    } finally {
      activeSendAttemptIdRef.current = null;
    }
  }, [
    attachments,
    clearAttachments,
    draft,
    getSendErrorLabel,
    labels?.sendFailed,
    onSend,
    addAttachments,
    canSend,
    contentRevision,
    streaming,
    setDraft,
    t,
    toast,
  ]);

  const failedDraft = failedDrafts[0];
  const isReplacing =
    replacement?.id === failedDraft?.id && replacement?.revision === contentRevision.current;
  const discardFailedDraft = () => {
    setFailedDrafts((current) => current.slice(1));
    setReplacement(undefined);
  };
  const restoreFailedDraft = () => {
    if (!failedDraft) return;
    if (!isReplacing && (draft.length > 0 || attachments.length > 0)) {
      setReplacement({ id: failedDraft.id, revision: contentRevision.current });
      return;
    }
    setDraft(failedDraft.text);
    setAttachments([...failedDraft.attachments]);
    discardFailedDraft();
  };

  return (
    <Composer
      canSend={
        !hasUnreadyComposerAttachments(attachments) &&
        (canSend ?? hasComposerSendableContent(draft, attachments))
      }
      labels={{
        send: labels?.send ?? t('chat.input.action.sendMessage'),
        stop: labels?.stop ?? t('chat.input.action.stopGenerating'),
      }}
      onChangeText={setDraft}
      onSend={handleSend}
      onStop={onStop}
      streaming={streaming}
      testID={testID}
      value={draft}
    >
      {failedDraft ? (
        <View className="gap-2 pb-3">
          <Text className="text-sm text-foreground">
            {t(isReplacing ? 'chat.input.replaceDraftPrompt' : 'chat.input.failedDraftSaved')}
          </Text>
          <Text className="text-sm text-muted-foreground" numberOfLines={2}>
            {failedDraft.text || t('chat.input.attachmentDraft')}
          </Text>
          <View className="flex-row gap-2">
            <Button
              size="sm"
              variant="secondary"
              onPress={restoreFailedDraft}
              testID="composer-restore-draft"
            >
              <Button.Label>
                {t(isReplacing ? 'chat.input.replaceDraft' : 'chat.input.restoreDraft')}
              </Button.Label>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onPress={isReplacing ? () => setReplacement(undefined) : discardFailedDraft}
            >
              <Button.Label>
                {t(isReplacing ? 'common.cancel' : 'chat.input.discardDraft')}
              </Button.Label>
            </Button>
          </View>
        </View>
      ) : null}
      {children}
    </Composer>
  );
}
