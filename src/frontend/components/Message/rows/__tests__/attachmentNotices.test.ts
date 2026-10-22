import type { TFunction } from 'i18next';

import type { CherryMessagePart } from '@/shared/data/types/message';

import { attachmentNotices } from '../attachmentNotices';
import type { UserMessageAttachmentPart } from '../partitionUserMessageParts';

const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key) as unknown as TFunction;

function attachment(
  filename: string,
  report?: UserMessageAttachmentPart['report'],
): UserMessageAttachmentPart {
  const part = {
    filename,
    mediaType: 'application/pdf',
    type: 'file',
    url: 'cherry-file://entry',
  } as Extract<CherryMessagePart, { type: 'file' }>;
  return { index: 0, part, ...(report ? { report } : {}) };
}

const report = {
  mode: 'document-text' as const,
  sourceTruncated: false,
  requestTruncated: false,
};

test('says which pages the model could not see, naming the file only among several', () => {
  const scan = attachment('scan.pdf', { ...report, unrecognizedPages: [3, 7] });
  expect(attachmentNotices([scan], t)).toEqual([
    'attachments.notice.unrecognizedPages {"pages":"3, 7"}',
  ]);
  const long = attachment('long.pdf', { ...report, sourceTruncated: true });
  expect(attachmentNotices([scan, attachment('photo.png'), long], t)).toEqual([
    'attachments.notice.withFilename {"name":"scan.pdf","notice":"attachments.notice.unrecognizedPages {\\"pages\\":\\"3, 7\\"}"}',
    'attachments.notice.withFilename {"name":"long.pdf","notice":"attachments.notice.sourceTruncated"}',
  ]);
});

test('stays silent for complete deliveries and pending messages without reports', () => {
  expect(attachmentNotices([attachment('a.pdf', report), attachment('b.pdf')], t)).toEqual([]);
});
