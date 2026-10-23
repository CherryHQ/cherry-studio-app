import type { TFunction } from 'i18next';

import type { UserMessageAttachmentPart } from './partitionUserMessageParts';

/** What the model did not receive from each sent attachment, in attachment order. */
export function attachmentNotices(
  attachments: readonly UserMessageAttachmentPart[],
  t: TFunction,
): { key: string; text: string }[] {
  const named = attachments.length > 1;
  return attachments.flatMap(({ index, part, report }) => {
    if (!report) return [];
    const notices = [
      ...(report.unrecognizedPages?.length
        ? [
            {
              kind: 'unrecognizedPages',
              text: t('attachments.notice.unrecognizedPages', {
                pages: report.unrecognizedPages.join(t('attachments.notice.pageSeparator')),
              }),
            },
          ]
        : []),
      ...(report.sourceTruncated
        ? [{ kind: 'sourceTruncated', text: t('attachments.notice.sourceTruncated') }]
        : []),
      ...(report.requestTruncated
        ? [{ kind: 'requestTruncated', text: t('attachments.notice.requestTruncated') }]
        : []),
    ];
    // Keyed by message part position: same-named attachments can produce identical text.
    return notices.map(({ kind, text }) => ({
      key: `${index}:${kind}`,
      text: named
        ? t('attachments.notice.withFilename', { name: part.filename, notice: text })
        : text,
    }));
  });
}
