import {
  DiagnosticReportInputSchema,
  diagnosticDescriptionByteLength,
  diagnosticReportDescription,
  normalizeDiagnosticDescription,
  DiagnosticFeedbackRecordSchema,
  DiagnosticProcessingStatusSchema,
  diagnosticStatusPageUrl,
} from '../diagnostics';

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
  test('rejects unsupported feedback fields', () => {
    expect(
      DiagnosticReportInputSchema.safeParse({ description: 'a', includeChatRecords: true }).success,
    ).toBe(false);
  });

  test('counts normalized multipart newlines and UTF-8 bytes', () => {
    expect(normalizeDiagnosticDescription('a\nb\rc\r\nd')).toBe('a\r\nb\r\nc\r\nd');
    expect(diagnosticDescriptionByteLength('中\n😀')).toBe(9);
    expect(
      DiagnosticReportInputSchema.parse({ description: ` ${'a'.repeat(4096)} ` }).description,
    ).toHaveLength(4096);
    expect(DiagnosticReportInputSchema.safeParse({ description: '中'.repeat(1366) }).success).toBe(
      false,
    );
    expect(DiagnosticReportInputSchema.safeParse({ description: ' \n ' }).success).toBe(false);
    expect(
      DiagnosticReportInputSchema.safeParse({ description: `${'a'.repeat(4094)}\nb` }).success,
    ).toBe(false);
  });
});

test('form choices count toward the upload byte limit and remain separate from user text', () => {
  const feedback = { feature: 'chat', problem: 'unexpected_result' } as const;
  const description = 'Expected one answer.\nReceived two.';
  const report = DiagnosticReportInputSchema.parse({ description, feedback });
  expect(report.description).toBe(description);
  expect(diagnosticReportDescription(report)).toBe(
    'Feature: chat\r\nProblem: unexpected_result\r\n\r\nExpected one answer.\r\nReceived two.',
  );
  expect(
    DiagnosticReportInputSchema.safeParse({ description: 'a'.repeat(4096), feedback }).success,
  ).toBe(false);
  expect(
    DiagnosticReportInputSchema.safeParse({
      description,
      feedback: { feature: 'unknown-feature', problem: 'error' },
    }).success,
  ).toBe(false);
});

test('incident metadata rejects raw payloads and credentials while retaining correlation IDs', () => {
  const context = {
    entry: 'error',
    feature: 'chat',
    executionSource: 'desktop',
    capturedAt: '2026-10-27T12:00:00Z',
    sessionId: 'session-1',
    executionId: 'execution-2',
    messageId: 'message-3',
    error: { code: 'EXECUTION_FAILED', sourceCode: '429', statusCode: 429, reason: 'rate_limit' },
  };
  expect(
    DiagnosticReportInputSchema.parse({ description: 'Request failed', context }).context,
  ).toEqual(context);
  for (const extra of [
    { responseBody: 'private response' },
    { message: 'private error' },
    { modelId: 'https://secret.example/model' },
    { providerId: 'sk-secret-token' },
    { error: { ...context.error, message: 'private error' } },
  ]) {
    expect(
      DiagnosticReportInputSchema.safeParse({
        description: 'Request failed',
        context: { ...context, ...extra },
      }).success,
    ).toBe(false);
  }
});

test('screenshot attachments accept opaque IDs, never arbitrary paths', () => {
  const report = { description: 'feedback' };
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
