import { AgentErrorViewSchema, AgentMessagePartSchema } from '../agent';

const filePart = {
  id: 'input-1',
  type: 'file',
  fileEntryId: '00000000-0000-7000-8000-000000000001',
  mediaType: 'application/pdf',
  purpose: 'input-attachment',
  name: 'report.pdf',
};

describe('persisted attachment feedback', () => {
  test('retains reports after JSON roundtrip and leaves old messages without invented status', () => {
    const report = {
      mode: 'document-text',
      sourceTruncated: true,
      requestTruncated: false,
      includedCharacters: 12,
    };
    expect(
      AgentMessagePartSchema.parse(
        JSON.parse(JSON.stringify({ ...filePart, attachmentReport: report })),
      ),
    ).toEqual({ ...filePart, attachmentReport: report });
    expect(AgentMessagePartSchema.parse(filePart)).not.toHaveProperty('attachmentReport');
  });

  test('keeps actionable issue metadata while preserving the existing protocol code', () => {
    const error = {
      code: 'ATTACHMENT_INVALID',
      message: 'diagnostic only',
      retryable: false,
      attachmentIssue: {
        code: 'file-bytes',
        fileEntryId: filePart.fileEntryId,
        name: 'report.pdf',
        limit: 100,
      },
    };
    expect(AgentErrorViewSchema.parse(JSON.parse(JSON.stringify(error)))).toEqual(error);
    expect(
      AgentErrorViewSchema.safeParse({
        ...error,
        attachmentIssue: { code: 'arbitrary-provider-message' },
      }).success,
    ).toBe(false);
  });
});
