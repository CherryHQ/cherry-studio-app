import type { TFunction } from 'i18next';

import { AgentProtocolError } from '@/shared/contracts/agent';
import {
  FileAttachmentError,
  type FileAttachmentIssue,
  type FileAttachmentReport,
} from '@/shared/contracts/fileAttachment';

export function getFileAttachmentIssue(error: unknown): FileAttachmentIssue | undefined {
  if (error instanceof FileAttachmentError) return error.issue;
  if (error instanceof AgentProtocolError) return error.view.attachmentIssue;
  return undefined;
}

/** Shared by every submit surface; diagnostic backend messages never become UI copy. */
export function fileAttachmentIssueDescription(issue: FileAttachmentIssue, t: TFunction): string {
  const reason = t(`attachments.issue.${issue.code}`, {
    count: issue.limit,
    // File limits are binary byte ceilings; keep the displayed unit equally explicit.
    size:
      issue.limit === undefined ? '' : `${Number((issue.limit / (1024 * 1024)).toFixed(1))} MiB`,
  });
  return [issue.name, reason, t('attachments.draftKept')].filter(Boolean).join('\n\n');
}

export function fileAttachmentNoticeKeys(report: FileAttachmentReport | undefined): string[] {
  if (!report) return [];
  const notices: string[] = [];
  if (report.mode === 'document-text') {
    const parserNotices = {
      builtin: 'attachments.notice.builtinText',
      'native-pdf': 'attachments.notice.nativePdfText',
    };
    notices.push(
      report.parser === 'builtin' || report.parser === 'native-pdf'
        ? parserNotices[report.parser]
        : 'attachments.notice.documentText',
    );
  }
  if (report.mode === 'document-ir' && report.delivery) {
    notices.push(
      report.delivery === 'deferred'
        ? 'attachments.notice.documentDeferred'
        : 'attachments.notice.documentIr',
    );
  }
  if (report.images?.sent) notices.push('attachments.notice.documentImagesSent');
  if (report.images?.omitted) {
    const reasons = report.images.omittedReasons ?? [];
    notices.push(
      ...(reasons.length
        ? [...new Set(reasons)].map((reason) => `attachments.notice.imageOmitted.${reason}`)
        : ['attachments.notice.documentImagesOmitted']),
    );
  }
  if (report.sourceTruncated) notices.push('attachments.notice.sourceTruncated');
  if (report.requestTruncated) notices.push('attachments.notice.requestTruncated');
  return notices;
}
