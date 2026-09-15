import { useAlert, useToast } from '@cherrystudio/ui/components';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import {
  fileAttachmentIssueDescription,
  getFileAttachmentIssue,
} from '@/frontend/utils/fileAttachmentFeedback';
import { loggerService } from '@/shared/core/logger/LoggerService';

const logger = loggerService.withContext('ComposerSurface');

/** Rejected submissions share feedback, including retries outside the input. */
export function useComposerSendError({
  getSendErrorLabel,
  sendFailedLabel,
}: {
  getSendErrorLabel?: (error: unknown) => string | undefined;
  sendFailedLabel?: string;
} = {}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { alert } = useAlert();

  return useCallback(
    (error: unknown, attemptId?: number) => {
      const issue = getFileAttachmentIssue(error);
      const explainedLabel = issue
        ? fileAttachmentIssueDescription(issue, t)
        : getSendErrorLabel?.(error);
      // The toast is deliberately vague, so without this the failure leaves no
      // trace at all and there is nothing to go on when a send breaks on device.
      // An explained rejection is an expected outcome, so it stays below the
      // error level that raises the development overlay.
      const errorDetail = error instanceof Error ? error : { error };
      if (explainedLabel) {
        logger.warn('Message send rejected', errorDetail, { attemptId });
      } else {
        logger.error('Message send failed', errorDetail, { attemptId });
      }
      if (issue) {
        alert.show({ title: t('attachments.sendRejected'), description: explainedLabel });
      } else {
        toast.show({
          label: explainedLabel ?? sendFailedLabel ?? t('chat.input.sendFailed'),
          variant: 'danger',
        });
      }
    },
    [alert, getSendErrorLabel, sendFailedLabel, t, toast],
  );
}
