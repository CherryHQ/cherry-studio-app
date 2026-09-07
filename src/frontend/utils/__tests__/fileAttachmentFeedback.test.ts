import type { TFunction } from 'i18next';

import { AgentProtocolError } from '@/shared/contracts/agent';
import { FileAttachmentError } from '@/shared/contracts/fileAttachment';

import {
  fileAttachmentIssueDescription,
  fileAttachmentNoticeKeys,
  getFileAttachmentIssue,
} from '../fileAttachmentFeedback';

const t = ((key: string) => key) as TFunction;

describe('file attachment feedback', () => {
  test('uses the same structured issue for chat and painting without displaying backend diagnostics', () => {
    const issue = { code: 'invalid-utf8' as const, name: 'notes.txt' };
    const painting = new FileAttachmentError(issue);
    const chat = new AgentProtocolError({
      code: 'ATTACHMENT_INVALID',
      message: 'private file:///device/path',
      retryable: false,
      attachmentIssue: issue,
    });
    expect(getFileAttachmentIssue(painting)).toEqual(getFileAttachmentIssue(chat));
    const description = fileAttachmentIssueDescription(getFileAttachmentIssue(chat)!, t);
    expect(description).toContain('notes.txt');
    expect(description).toContain('attachments.issue.invalid-utf8');
    expect(description).not.toContain('file:///');
    expect(getFileAttachmentIssue(new Error('invalid-utf8'))).toBeUndefined();
  });

  test('distinguishes extraction and request truncation, leaving old messages unknown', () => {
    expect(fileAttachmentNoticeKeys(undefined)).toEqual([]);
    expect(
      fileAttachmentNoticeKeys({
        mode: 'document-text',
        sourceTruncated: true,
        requestTruncated: false,
      }),
    ).toEqual(['attachments.notice.documentText', 'attachments.notice.sourceTruncated']);
    expect(
      fileAttachmentNoticeKeys({ mode: 'text', sourceTruncated: false, requestTruncated: true }),
    ).toEqual(['attachments.notice.requestTruncated']);
  });

  test('never describes deferred AnyDoc content as sent or truncated', () => {
    expect(
      fileAttachmentNoticeKeys({
        mode: 'document-ir',
        parser: 'anydoc',
        delivery: 'deferred',
        sourceTruncated: false,
        requestTruncated: false,
        images: { sent: 1, omitted: 2, omittedReasons: ['unsupported-type', 'budget'] },
      }),
    ).toEqual([
      'attachments.notice.documentDeferred',
      'attachments.notice.documentImagesSent',
      'attachments.notice.imageOmitted.unsupported-type',
      'attachments.notice.imageOmitted.budget',
    ]);
    expect(
      fileAttachmentNoticeKeys({
        mode: 'document-ir',
        parser: 'anydoc',
        delivery: 'complete',
        sourceTruncated: false,
        requestTruncated: false,
        images: { sent: 0, omitted: 2, omittedReasons: ['model-unsupported'] },
      }),
    ).toEqual([
      'attachments.notice.documentIr',
      'attachments.notice.imageOmitted.model-unsupported',
    ]);
    expect(
      fileAttachmentNoticeKeys({
        mode: 'document-ir',
        sourceTruncated: false,
        requestTruncated: false,
      }),
    ).toEqual([]);
  });

  test.each(['builtin', 'native-pdf'] as const)('labels the actual %s text parser', (parser) => {
    expect(
      fileAttachmentNoticeKeys({
        mode: 'document-text',
        parser,
        sourceTruncated: false,
        requestTruncated: false,
      }),
    ).toEqual([
      parser === 'builtin' ? 'attachments.notice.builtinText' : 'attachments.notice.nativePdfText',
    ]);
  });

  test.each(['parser-unavailable', 'parser-unsupported'] as const)(
    'localizes %s without showing native details',
    (code) => {
      const error = new FileAttachmentError(
        { code, name: 'report.doc' },
        {
          cause: new Error('private native diagnostic'),
        },
      );
      const description = fileAttachmentIssueDescription(getFileAttachmentIssue(error)!, t);
      expect(description).toBe(`report.doc\n\nattachments.issue.${code}\n\nattachments.draftKept`);
      expect(description).not.toContain('private');
    },
  );
});
