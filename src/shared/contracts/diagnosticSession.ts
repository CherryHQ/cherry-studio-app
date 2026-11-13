import { z } from 'zod';

import type { UniqueModelId } from '@/shared/data/types/model';
import { diagnosticIdentifier } from '@/shared/utils/diagnosticIdentifier';

import { AiFailureReasonSchema } from './aiFailure';
import type { DiagnosticFeedbackContext } from './diagnostics';
import { ProviderConfigurationIssueSchema, type ProviderConfigurationIssue } from './providers';

const DiagnosticIdentifierSchema = z
  .string()
  .refine((value) => diagnosticIdentifier(value) === value);

export const DiagnosticFailureSchema = z.strictObject({
  code: DiagnosticIdentifierSchema.optional(),
  sourceCode: DiagnosticIdentifierSchema.optional(),
  reason: AiFailureReasonSchema.optional(),
  statusCode: z.number().int().min(100).max(599).optional(),
});

export const DiagnosticCheckIdSchema = z.enum([
  'data',
  'runtime',
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
  'data',
  'runtime',
  'not_initialized',
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

export const DiagnosticEndpointCheckSchema = DiagnosticCheckSchema.extend({
  id: z.literal('endpoint'),
});
export type DiagnosticEndpointCheck = z.infer<typeof DiagnosticEndpointCheckSchema>;

export const DiagnosticFeedbackSummarySchema = z.strictObject({
  checkedAt: z.iso.datetime({ offset: true }),
  checks: z.array(DiagnosticCheckSchema).max(DiagnosticCheckIdSchema.options.length),
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
    configurationIssue?: ProviderConfigurationIssue | 'disabled-provider';
  };
  checks: DiagnosticCheck[];
};

export const DiagnosticConfigurationSchema = z.strictObject({
  provider: DiagnosticIdentifierSchema.nullable(),
  model: DiagnosticIdentifierSchema.nullable(),
  endpointHost: DiagnosticIdentifierSchema.nullable(),
  configurationIssue: z
    .union([ProviderConfigurationIssueSchema, z.literal('disabled-provider')])
    .nullable(),
  remoteExecution: z.boolean(),
});
export type DiagnosticConfiguration = z.infer<typeof DiagnosticConfigurationSchema>;

export const DiagnosticPluginsSchema = z.strictObject({
  enabledCount: z.number().int().nonnegative(),
  connectedCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  connections: z
    .array(z.strictObject({ state: z.enum(['connected', 'connecting', 'disabled', 'error']) }))
    .max(200),
});
export type DiagnosticPlugins = z.infer<typeof DiagnosticPluginsSchema>;

/** The log projector owns the fact allowlist; this contract admits only its metadata envelope. */
export const DiagnosticLogsSchema = z
  .array(
    z.strictObject({
      schemaVersion: z.literal(1),
      capture: z.literal('metadata'),
      timestamp: z.iso.datetime({ offset: true }),
      level: z.enum(['warn', 'error']),
      module: DiagnosticIdentifierSchema,
      message: z.string().max(160),
      facts: z.record(
        z.string(),
        z.union([DiagnosticIdentifierSchema, z.number().finite(), z.boolean()]),
      ),
      repetition: z
        .strictObject({
          count: z.number().int().positive(),
          firstSeenAt: z.iso.datetime({ offset: true }),
          lastSeenAt: z.iso.datetime({ offset: true }),
        })
        .optional(),
    }),
  )
  .max(12);
export type DiagnosticLogs = z.infer<typeof DiagnosticLogsSchema>;

export const DiagnosticToolResultSchema = z.discriminatedUnion('tool', [
  z.strictObject({ tool: z.literal('configuration'), data: DiagnosticConfigurationSchema }),
  z.strictObject({ tool: z.literal('endpoint'), data: DiagnosticEndpointCheckSchema }),
  z.strictObject({ tool: z.literal('plugins'), data: DiagnosticPluginsSchema }),
  z.strictObject({ tool: z.literal('logs'), data: DiagnosticLogsSchema }),
]);
export type DiagnosticToolResult = z.infer<typeof DiagnosticToolResultSchema>;
export type DiagnosticToolId = DiagnosticToolResult['tool'];
export type DiagnosticReadTool = {
  [Tool in DiagnosticToolId]: {
    id: Tool;
    description: string;
    read(signal: AbortSignal): Promise<Extract<DiagnosticToolResult, { tool: Tool }>['data']>;
  };
}[DiagnosticToolId];
export type DiagnosticEvidence = { id: string } & (
  | DiagnosticToolResult
  | { tool: DiagnosticToolId; unavailable: 'result_limit' }
);

export const DiagnosticAiContextSchema = z.strictObject({
  configuration: DiagnosticConfigurationSchema,
  checks: z.array(DiagnosticCheckSchema).max(DiagnosticCheckIdSchema.options.length),
  incident: DiagnosticFailureSchema.nullable(),
});
export type DiagnosticAiContext = z.infer<typeof DiagnosticAiContextSchema>;
export type DiagnosticAiReport = {
  modelName: string;
  cause: string;
  advice: string[];
  evidence: DiagnosticEvidence[];
};

/** The diagnostic sheet owns this run; dispose cancels and joins admitted work. */
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
