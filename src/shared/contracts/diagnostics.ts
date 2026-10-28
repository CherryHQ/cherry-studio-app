import { z } from 'zod';

import { diagnosticIdentifier } from '@/shared/utils/diagnosticIdentifier';

import { AiFailureReasonSchema } from './aiFailure';

export const DIAGNOSTIC_SOURCE_LIMIT_BYTES = 50 * 1024 * 1024;
export const DIAGNOSTIC_DESCRIPTION_MAX_BYTES = 4096;
export const DIAGNOSTIC_SCREENSHOT_DIRECTORY = 'FeedbackScreenshots';
export const DIAGNOSTIC_SCREENSHOT_MAX_BYTES = 8 * 1024 * 1024;
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

export const DiagnosticFeedbackFeatureSchema = z.enum([
  'chat',
  'agents',
  'providers',
  'plugins',
  'paintings',
  'files',
  'desktop',
  'backup',
  'other',
]);
export type DiagnosticFeedbackFeature = z.infer<typeof DiagnosticFeedbackFeatureSchema>;
export const DiagnosticFeedbackProblemSchema = z.enum([
  'error',
  'performance',
  'interface',
  'unexpected_result',
  'suggestion',
  'other',
]);
export type DiagnosticFeedbackProblem = z.infer<typeof DiagnosticFeedbackProblemSchema>;

const DiagnosticIdentifierSchema = z
  .string()
  .refine((value) => diagnosticIdentifier(value) === value);
/** Only app-owned metadata crosses this boundary; error messages and response bodies never do. */
export const DiagnosticFeedbackContextSchema = z.strictObject({
  entry: z.enum(['error', 'shake']),
  feature: DiagnosticFeedbackFeatureSchema,
  capturedAt: z.iso.datetime({ offset: true }),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
  executionSource: z.enum(['local', 'desktop']).optional(),
  sessionId: DiagnosticIdentifierSchema.optional(),
  agentId: DiagnosticIdentifierSchema.optional(),
  executionId: DiagnosticIdentifierSchema.optional(),
  turnId: DiagnosticIdentifierSchema.optional(),
  messageId: DiagnosticIdentifierSchema.optional(),
  messageCreatedAt: z.iso.datetime({ offset: true }).optional(),
  jobId: DiagnosticIdentifierSchema.optional(),
  paintingId: DiagnosticIdentifierSchema.optional(),
  providerId: DiagnosticIdentifierSchema.optional(),
  modelId: DiagnosticIdentifierSchema.optional(),
  error: z
    .strictObject({
      code: DiagnosticIdentifierSchema.optional(),
      sourceCode: DiagnosticIdentifierSchema.optional(),
      reason: AiFailureReasonSchema.optional(),
      statusCode: z.number().int().min(100).max(599).optional(),
    })
    .optional(),
});
export type DiagnosticFeedbackContext = z.infer<typeof DiagnosticFeedbackContextSchema>;

const DiagnosticFeedbackSchema = z.strictObject({
  feature: DiagnosticFeedbackFeatureSchema,
  problem: DiagnosticFeedbackProblemSchema,
});

/** The existing upload API receives the form choices alongside the user's own description. */
export function diagnosticReportDescription(input: {
  description: string;
  feedback?: z.infer<typeof DiagnosticFeedbackSchema>;
}): string {
  const header = input.feedback
    ? `Feature: ${input.feedback.feature}\nProblem: ${input.feedback.problem}\n\n`
    : '';
  return normalizeDiagnosticDescription(`${header}${input.description.trim()}`);
}

export const DiagnosticReportInputSchema = z
  .strictObject({
    screenshotId: z.uuidv4().optional(),
    description: z.string().trim().min(1),
    feedback: DiagnosticFeedbackSchema.optional(),
    context: DiagnosticFeedbackContextSchema.optional(),
  })
  .refine(
    (input) =>
      diagnosticDescriptionByteLength(diagnosticReportDescription(input)) <=
      DIAGNOSTIC_DESCRIPTION_MAX_BYTES,
    { path: ['description'] },
  );
export type DiagnosticReportInput = z.infer<typeof DiagnosticReportInputSchema>;

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
    readonly code: 'BUNDLE_BUILD_FAILED',
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = 'DiagnosticError';
  }
}

export interface DiagnosticsModule {
  uploadBundle(input: DiagnosticReportInput): Promise<DiagnosticUploadResult>;
  getReportStatus(reportId: string, signal?: AbortSignal): Promise<DiagnosticReportStatusResult>;
}
