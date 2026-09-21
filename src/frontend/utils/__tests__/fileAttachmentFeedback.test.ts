import type { TFunction } from 'i18next';

import { AgentProtocolError } from '@/shared/contracts/agent';
import { FileAttachmentError } from '@/shared/contracts/fileAttachment';

import { fileAttachmentIssueDescription, getFileAttachmentIssue } from '../fileAttachmentFeedback';

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
