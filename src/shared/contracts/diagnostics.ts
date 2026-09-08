import { z } from 'zod';

export const DIAGNOSTIC_SOURCE_LIMIT_BYTES = 50 * 1024 * 1024;
export const DIAGNOSTIC_DESCRIPTION_MAX_BYTES = 4096;
export const DiagnosticRangeSchema = z.enum(['24h', '3d', '7d']);
export type DiagnosticRange = z.infer<typeof DiagnosticRangeSchema>;

export function normalizeDiagnosticDescription(value: string): string {
  return value.replace(/\r\n|\r|\n/g, '\r\n');
}

export function diagnosticDescriptionByteLength(value: string): number {
  return new TextEncoder().encode(normalizeDiagnosticDescription(value)).byteLength;
}

export const DiagnosticBundleInputSchema = z.strictObject({
  includeChatRecords: z.boolean(),
  includeLogs: z.boolean(),
  includeTraces: z.boolean(),
  range: DiagnosticRangeSchema,
});
export type DiagnosticBundleInput = z.infer<typeof DiagnosticBundleInputSchema>;

export const DiagnosticUploadInputSchema = DiagnosticBundleInputSchema.extend({
  description: z
    .string()
    .trim()
    .min(1)
    .refine((value) => diagnosticDescriptionByteLength(value) <= DIAGNOSTIC_DESCRIPTION_MAX_BYTES),
});
export type DiagnosticUploadInput = z.infer<typeof DiagnosticUploadInputSchema>;

export type DiagnosticInspection = {
  hasWarnings: boolean;
  sourceLimitBytes: number;
  sources: {
    chatRecords: { available: boolean; estimatedBytes: number; messageCount: number };
    crashDumps: { fileCount: number };
    logs: { available: boolean; estimatedBytes: number; fileCount: number };
    traces: { available: boolean; estimatedBytes: number; fileCount: number };
  };
};

export type DiagnosticSavedBundle = {
  status: 'saved';
  archiveBytes: number;
  bundleId: string;
  fileName: string;
  /** System document URI selected by the user, never an internal staging path. */
  filePath: string;
  hasWarnings: boolean;
  includedFileCount: number;
  omittedFileCount: number;
};

export type DiagnosticExportResult = DiagnosticSavedBundle | { status: 'busy' | 'canceled' };

export type DiagnosticUploadFailureReason =
  | 'invalid_archive'
  | 'archive_too_large'
  | 'authentication_failed'
  | 'rate_limited'
  | 'service_unavailable'
  | 'submission_rejected';

export type DiagnosticUploadResult =
  | { status: 'busy' }
  | { status: 'uploaded'; reportId: string }
  | {
      status: 'submission_failed';
      bundleId: string;
      fileName: string;
      reason: DiagnosticUploadFailureReason;
    }
  | { status: 'submission_unknown'; bundleId: string; fileName: string };

export type DiagnosticSaveUploadResult =
  | { status: 'busy' | 'canceled' }
  | { status: 'saved'; bundleId: string; fileName: string; filePath: string };

export class DiagnosticError extends Error {
  constructor(
    readonly code:
      | 'INSPECT_FAILED'
      | 'BUNDLE_BUILD_FAILED'
      | 'SAVE_FAILED'
      | 'RETRY_NOT_AVAILABLE'
      | 'NATIVE_UNAVAILABLE',
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = 'DiagnosticError';
  }
}

export interface DiagnosticsModule {
  inspect(range: DiagnosticRange): Promise<DiagnosticInspection>;
  exportBundle(input: DiagnosticBundleInput): Promise<DiagnosticExportResult>;
  uploadBundle(input: DiagnosticUploadInput): Promise<DiagnosticUploadResult>;
  retryUpload(input: { bundleId: string }): Promise<DiagnosticUploadResult>;
  saveUploadBundle(input: { bundleId: string }): Promise<DiagnosticSaveUploadResult>;
  discardUpload(input: {
    bundleId: string;
  }): Promise<{ status: 'busy' | 'discarded' | 'not_found' }>;
}
