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
});
