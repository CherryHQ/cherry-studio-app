import { z } from 'zod';

export const DIAGNOSTIC_SOURCE_LIMIT_BYTES = 50 * 1024 * 1024;
export const DIAGNOSTIC_DESCRIPTION_MAX_BYTES = 4096;
export const DIAGNOSTIC_SCREENSHOT_DIRECTORY = 'FeedbackScreenshots';
export const DIAGNOSTIC_SCREENSHOT_MAX_BYTES = 8 * 1024 * 1024;
export const DiagnosticRangeSchema = z.enum(['24h', '3d', '7d']);
export type DiagnosticRange = z.infer<typeof DiagnosticRangeSchema>;
export const DIAGNOSTIC_API_ORIGIN = 'https://api.cherry-ai.com';
export const DiagnosticReportIdSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
export const DiagnosticProcessingStatusSchema = z.enum([
  'pending',
  'unprocessed',
  'investigating',
  'resolved',
  'closed',
]);
export type DiagnosticProcessingStatus = z.infer<typeof DiagnosticProcessingStatusSchema>;

export function diagnosticStatusPageUrl(reportId: string): string {
  return `${DIAGNOSTIC_API_ORIGIN}/diagnostics/${DiagnosticReportIdSchema.parse(reportId)}`;
}

export type DiagnosticReportStatusResult =
  | {
      status: 'found';
      reportId: string;
      processingStatus: DiagnosticProcessingStatus;
      createdAt: string;
      updatedAt: string;
    }
  | { status: 'not_found' }
  | { status: 'failed'; reason: 'rate_limited' | 'unavailable' };

export const DiagnosticFeedbackRecordSchema = z.object({
  reportId: DiagnosticReportIdSchema,
  description: z.string().max(4096),
  submittedAt: z.iso.datetime({ offset: true }),
  processingStatus: DiagnosticProcessingStatusSchema,
  statusUpdatedAt: z.iso.datetime({ offset: true }).optional(),
  lastCheckedAt: z.iso.datetime({ offset: true }).optional(),
  isUnavailable: z.boolean(),
});
export type DiagnosticFeedbackRecord = z.infer<typeof DiagnosticFeedbackRecordSchema>;

export function normalizeDiagnosticDescription(value: string): string {
  return value.replace(/\r\n|\r|\n/g, '\r\n');
}

export function diagnosticDescriptionByteLength(value: string): number {
  return new TextEncoder().encode(normalizeDiagnosticDescription(value)).byteLength;
}

export const DiagnosticBundleInputSchema = z.strictObject({
  includeLogs: z.boolean(),
  includeTraces: z.boolean(),
  range: DiagnosticRangeSchema,
});
export type DiagnosticBundleInput = z.infer<typeof DiagnosticBundleInputSchema>;

export const DiagnosticReportInputSchema = DiagnosticBundleInputSchema.extend({
  screenshotId: z.uuidv4().optional(),
  description: z
    .string()
    .trim()
    .min(1)
    .refine((value) => diagnosticDescriptionByteLength(value) <= DIAGNOSTIC_DESCRIPTION_MAX_BYTES),
});
export type DiagnosticReportInput = z.infer<typeof DiagnosticReportInputSchema>;

export type DiagnosticInspection = {
  hasWarnings: boolean;
  sourceLimitBytes: number;
  sources: {
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
  | 'not_configured'
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
      reason: DiagnosticUploadFailureReason;
    }
  | { status: 'submission_unknown' };

export class DiagnosticError extends Error {
  constructor(
    readonly code: 'INSPECT_FAILED' | 'BUNDLE_BUILD_FAILED' | 'SAVE_FAILED' | 'NATIVE_UNAVAILABLE',
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = 'DiagnosticError';
  }
}

export interface DiagnosticsModule {
  inspect(range: DiagnosticRange): Promise<DiagnosticInspection>;
  exportBundle(input: DiagnosticReportInput): Promise<DiagnosticExportResult>;
  uploadBundle(input: DiagnosticReportInput): Promise<DiagnosticUploadResult>;
  getReportStatus(reportId: string, signal?: AbortSignal): Promise<DiagnosticReportStatusResult>;
}
