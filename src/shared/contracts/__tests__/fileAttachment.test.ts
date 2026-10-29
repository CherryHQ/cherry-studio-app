import { AgentErrorViewSchema, AgentMessagePartSchema } from '../agent';

const filePart = {
  id: 'input-1',
  type: 'file',
  fileEntryId: '00000000-0000-7000-8000-000000000001',
  mediaType: 'application/pdf',
  purpose: 'input-attachment',
  filename: 'report.pdf',
};

describe('persisted attachment feedback', () => {
  test('roundtrips image OCR delivery facts and failure reasons without allowing recognized text in reports', () => {
    const report = {
      mode: 'image-text',
      parser: 'native-image-ocr',
      sourceTruncated: false,
      requestTruncated: false,
      includedCharacters: 8,
    };
    const image = {
      ...filePart,
      mediaType: 'image/png',
      filename: 'receipt.png',
      attachmentReport: report,
    };
    expect(AgentMessagePartSchema.parse(JSON.parse(JSON.stringify(image)))).toEqual(image);
    expect(
      AgentMessagePartSchema.safeParse({
        ...image,
        attachmentReport: { ...report, text: 'private OCR text' },
      }).success,
    ).toBe(false);
    for (const code of ['image-ocr-empty', 'image-ocr-failed', 'image-ocr-unsupported']) {
      const error = {
        code: 'ATTACHMENT_INVALID',
        message: 'diagnostic',
        retryable: false,
        attachmentIssue: { code },
      };
      expect(AgentErrorViewSchema.parse(JSON.parse(JSON.stringify(error)))).toEqual(error);
    }
  });
  test('roundtrips OCR failure metadata without persisting page images or recognized text', () => {
    const error = {
      code: 'ATTACHMENT_INVALID',
      message: 'PDF recognition failed',
      retryable: false,
      attachmentIssue: {
        code: 'document-ocr-failed',
        name: 'scan.pdf',
        fileEntryId: filePart.fileEntryId,
      },
    };
    expect(AgentErrorViewSchema.parse(JSON.parse(JSON.stringify(error)))).toEqual(error);
  });
  test('retains reports after JSON roundtrip and leaves old messages without invented status', () => {
    const report = {
      mode: 'document-text',
      sourceTruncated: true,
      unrecognizedPages: [1, 3],
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

  test('roundtrips deferred document and image delivery facts without allowing persisted IR', () => {
    const report = {
      mode: 'document-ir',
      parser: 'anydoc',
      parserVersion: '0.4.1',
      sourceTruncated: false,
      requestTruncated: false,
      delivery: 'deferred',
      includedCharacters: 200,
      images: { sent: 1, omitted: 2 },
    };
    expect(
      AgentMessagePartSchema.parse(
        JSON.parse(JSON.stringify({ ...filePart, attachmentReport: report })),
      ),
    ).toEqual({ ...filePart, attachmentReport: report });
    expect(
      AgentMessagePartSchema.safeParse({ ...filePart, attachmentReport: { ...report, ir: {} } })
        .success,
    ).toBe(false);
    expect(
      AgentErrorViewSchema.parse({
        code: 'ATTACHMENT_INVALID',
        message: 'parser unavailable',
        retryable: false,
        attachmentIssue: { code: 'parser-unavailable' },
      }),
    ).toHaveProperty('attachmentIssue.code', 'parser-unavailable');
  });
});
