import { z } from 'zod';

import type { UniqueModelId } from '@/shared/data/types/model';

import type { DiagnosticFeedbackContext } from './diagnostics';

export const DiagnosticCheckIdSchema = z.enum([
  'model',
  'endpoint',
  'model_list',
  'conversation',
  'plugins',
  'permissions',
  'storage',
]);
export const DiagnosticCheckStatusSchema = z.enum([
  'pass',
  'warn',
  'fail',
  'skipped',
  'error',
  'pending',
]);
export const DiagnosticIssueSchema = z.enum([
  'missing_model',
  'configuration',
  'authentication',
  'permission',
  'quota',
  'rate_limit',
  'network',
  'timeout',
  'model',
  'unavailable',
  'unsupported',
  'remote',
  'storage',
  'unknown',
]);
export const DiagnosticCheckSchema = z.strictObject({
  id: DiagnosticCheckIdSchema,
  status: DiagnosticCheckStatusSchema,
  issue: DiagnosticIssueSchema.optional(),
  facts: z
    .partialRecord(
      z.enum([
        'httpStatus',
        'latencyMs',
        'enabledCount',
        'connectedCount',
        'freeBytes',
        'missingCount',
      ]),
      z.number().finite().nonnegative(),
    )
    .optional(),
});
export type DiagnosticCheck = z.infer<typeof DiagnosticCheckSchema>;
export type DiagnosticIssue = z.infer<typeof DiagnosticIssueSchema>;

export const DiagnosticFeedbackSummarySchema = z.strictObject({
  checkedAt: z.iso.datetime({ offset: true }),
  checks: z.array(DiagnosticCheckSchema).max(7),
  aiCompleted: z.boolean(),
});
export type DiagnosticFeedbackSummary = z.infer<typeof DiagnosticFeedbackSummarySchema>;

export type DiagnosticReport = {
  checkedAt: string;
  context?: DiagnosticFeedbackContext;
  target?: {
    uniqueModelId: UniqueModelId;
    providerId: string;
    modelId: string;
    providerName: string;
    modelName: string;
    endpointHost?: string;
  };
  checks: DiagnosticCheck[];
};

export type DiagnosticToolId = 'configuration' | 'logs' | 'endpoint' | 'plugins';
export type DiagnosticEvidence = {
  id: string;
  tool: DiagnosticToolId;
  facts: string;
};
export type DiagnosticAiReport = {
  modelName: string;
  cause: string;
  advice: string[];
  evidence: DiagnosticEvidence[];
};

/** A route owns this transient run; dispose cancels and joins all admitted work. */
export interface DiagnosticSession {
  check(options?: {
    network?: boolean;
    onCheck?: (check: DiagnosticCheck) => void;
  }): Promise<DiagnosticReport>;
  checkConversation(): Promise<DiagnosticReport>;
  diagnose(
    modelId: UniqueModelId,
    onEvidence?: (evidence: DiagnosticEvidence) => void,
  ): Promise<DiagnosticAiReport>;
  cancel(): void;
  dispose(): Promise<void>;
}

export class DiagnosticSessionError extends Error {
  constructor(
    readonly reason:
      | 'busy'
      | 'cancelled'
      | 'timeout'
      | 'stale'
      | 'unavailable'
      | 'unsupported_model'
      | 'budget'
      | 'invalid_response',
  ) {
    super(reason);
    this.name = 'DiagnosticSessionError';
  }
}
