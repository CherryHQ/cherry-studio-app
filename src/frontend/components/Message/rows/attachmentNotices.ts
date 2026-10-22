import type { TFunction } from 'i18next';

import type { UserMessageAttachmentPart } from './partitionUserMessageParts';

/** What the model did not receive from each sent attachment, in attachment order. */
export function attachmentNotices(
  attachments: readonly UserMessageAttachmentPart[],
  t: TFunction,
): string[] {
  const named = attachments.length > 1;
  return attachments.flatMap(({ part, report }) => {
    if (!report) return [];
    const notices = [
      ...(report.unrecognizedPages?.length
        ? [
            t('attachments.notice.unrecognizedPages', {
              pages: report.unrecognizedPages.join(', '),
            }),
          ]
        : []),
      ...(report.sourceTruncated ? [t('attachments.notice.sourceTruncated')] : []),
      ...(report.requestTruncated ? [t('attachments.notice.requestTruncated')] : []),
    ];
    return named
      ? notices.map((notice) =>
          t('attachments.notice.withFilename', { name: part.filename, notice }),
        )
      : notices;
  });
}
