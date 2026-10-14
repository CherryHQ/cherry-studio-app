import {
  DiagnosticBundleInputSchema,
  DiagnosticReportInputSchema,
  diagnosticDescriptionByteLength,
  normalizeDiagnosticDescription,
  DiagnosticFeedbackRecordSchema,
  DiagnosticProcessingStatusSchema,
  diagnosticStatusPageUrl,
} from '../diagnostics';

const input = { range: '24h', includeLogs: true, includeTraces: true };

describe('diagnostic wire inputs', () => {
  test('status links accept only tracking UUIDs and receipt records are JSON-safe', () => {
    const reportId = '550e8400-e29b-41d4-a716-446655440000';
    expect(diagnosticStatusPageUrl(reportId)).toBe(
      `https://api.cherry-ai.com/diagnostics/${reportId}`,
    );
    expect(() => diagnosticStatusPageUrl('../admin')).toThrow();
    expect(DiagnosticProcessingStatusSchema.safeParse('uploaded').success).toBe(false);
    const record = DiagnosticFeedbackRecordSchema.parse({
      reportId,
      description: '反馈',
      submittedAt: '2026-10-12T00:00:00Z',
      processingStatus: 'unprocessed',
      isUnavailable: false,
    });
    expect(DiagnosticFeedbackRecordSchema.parse(JSON.parse(JSON.stringify(record)))).toEqual(
      record,
    );
  });
  test('accepts only PC ranges and explicit source choices', () => {
    expect(DiagnosticBundleInputSchema.parse(input)).toEqual(input);
    expect(DiagnosticBundleInputSchema.safeParse({ ...input, range: '30d' }).success).toBe(false);
    expect(
      DiagnosticBundleInputSchema.safeParse({ ...input, includeChatRecords: true }).success,
    ).toBe(false);
  });

  test('counts normalized multipart newlines and UTF-8 bytes', () => {
    expect(normalizeDiagnosticDescription('a\nb\rc\r\nd')).toBe('a\r\nb\r\nc\r\nd');
    expect(diagnosticDescriptionByteLength('中\n😀')).toBe(9);
    expect(
      DiagnosticReportInputSchema.parse({ ...input, description: ` ${'a'.repeat(4096)} ` })
        .description,
    ).toHaveLength(4096);
    expect(
      DiagnosticReportInputSchema.safeParse({ ...input, description: '中'.repeat(1366) }).success,
    ).toBe(false);
    expect(DiagnosticReportInputSchema.safeParse({ ...input, description: ' \n ' }).success).toBe(
      false,
    );
    expect(
      DiagnosticReportInputSchema.safeParse({ ...input, description: `${'a'.repeat(4094)}\nb` })
        .success,
    ).toBe(false);
  });
});

test('screenshot attachments accept opaque IDs, never arbitrary paths', () => {
  const report = { ...input, description: 'feedback' };
  expect(
    DiagnosticReportInputSchema.parse({
      ...report,
      screenshotId: '550e8400-e29b-41d4-a716-446655440000',
    }).screenshotId,
  ).toBeDefined();
  for (const screenshotId of [
    '../private',
    'file:///private.png',
    'https://example.com/image.png',
    '',
  ])
    expect(DiagnosticReportInputSchema.safeParse({ ...report, screenshotId }).success).toBe(false);
});
