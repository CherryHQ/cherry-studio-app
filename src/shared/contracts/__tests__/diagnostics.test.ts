import {
  DiagnosticBundleInputSchema,
  DiagnosticUploadInputSchema,
  diagnosticDescriptionByteLength,
  normalizeDiagnosticDescription,
} from '../diagnostics';

const input = { range: '24h', includeLogs: true, includeTraces: true, includeChatRecords: false };

describe('diagnostic wire inputs', () => {
  test('accepts only PC ranges and explicit source choices', () => {
    expect(DiagnosticBundleInputSchema.parse(input)).toEqual(input);
    expect(DiagnosticBundleInputSchema.safeParse({ ...input, range: '30d' }).success).toBe(false);
    expect(DiagnosticBundleInputSchema.safeParse({ ...input, redact: true }).success).toBe(false);
  });

  test('counts normalized multipart newlines and UTF-8 bytes', () => {
    expect(normalizeDiagnosticDescription('a\nb\rc\r\nd')).toBe('a\r\nb\r\nc\r\nd');
    expect(diagnosticDescriptionByteLength('中\n😀')).toBe(9);
    expect(
      DiagnosticUploadInputSchema.parse({ ...input, description: ` ${'a'.repeat(4096)} ` })
        .description,
    ).toHaveLength(4096);
    expect(
      DiagnosticUploadInputSchema.safeParse({ ...input, description: '中'.repeat(1366) }).success,
    ).toBe(false);
    expect(DiagnosticUploadInputSchema.safeParse({ ...input, description: ' \n ' }).success).toBe(
      false,
    );
    expect(
      DiagnosticUploadInputSchema.safeParse({ ...input, description: `${'a'.repeat(4094)}\nb` })
        .success,
    ).toBe(false);
  });
});
