/**
 * Agent Protocol values: views of Agents, Sessions, turns, messages, approvals,
 * and failures. Every shape is JSON-safe and validated at the boundary; see
 * `./index.ts` for the protocol overview.
 */

import * as z from 'zod';

import { MessageStatsSchema } from '@/shared/data/types/message';
import { UniqueModelIdSchema } from '@/shared/data/types/model';

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export const AgentViewSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string(),
});
export type AgentView = z.infer<typeof AgentViewSchema>;

/**
 * Mobile Agent execution boundary, not an engine selector. `local` always
 * means this mobile app. Cloud and LAN desktop control are separate product
 * domains and do not add variants to this contract.
 */
export const AgentExecutionTargetSchema = z.strictObject({
  kind: z.literal('local'),
});
export type AgentExecutionTarget = z.infer<typeof AgentExecutionTargetSchema>;

const AgentBuiltInToolRefSchema = z.strictObject({
  source: z.literal('builtin'),
  capabilityId: z.string().min(1),
});
const AgentMcpToolRefSchema = z.strictObject({
  source: z.literal('mcp'),
  serverId: z.string().min(1),
  rawToolName: z.string().min(1),
});

export const AgentToolRefSchema = z.discriminatedUnion('source', [
  AgentBuiltInToolRefSchema,
  AgentMcpToolRefSchema,
]);
export type AgentToolRef = z.infer<typeof AgentToolRefSchema>;

export const AgentMessageToolRefSchema = z.discriminatedUnion('source', [
  AgentBuiltInToolRefSchema,
  AgentMcpToolRefSchema,
  z.strictObject({
    source: z.literal('meta'),
    name: z.string().min(1),
  }),
]);
export type AgentMessageToolRef = z.infer<typeof AgentMessageToolRefSchema>;

const AgentInferenceToolSnapshotSchema = z.strictObject({
  ref: AgentToolRefSchema,
  providerName: z.string(),
  displayName: z.string(),
  approval: z.enum(['auto', 'ask', 'deny']),
});

/** Immutable, credential-free facts used to construct one Agent Runtime request. */
export const AgentInferenceSnapshotV1Schema = z.strictObject({
  version: z.literal(1),
  model: z.strictObject({
    uniqueModelId: UniqueModelIdSchema,
    providerId: z.string().min(1),
    modelId: z.string().min(1),
    apiModelId: z.string().optional(),
    name: z.string(),
  }),
  reasoningEffort: z.string().min(1).optional(),
  parameters: z.strictObject({
    temperature: z.number().finite().optional(),
    maxOutputTokens: z.number().finite().optional(),
  }),
  tools: z.array(AgentInferenceToolSnapshotSchema),
});
export type AgentInferenceSnapshotV1 = z.infer<typeof AgentInferenceSnapshotV1Schema>;

export const AgentInferenceSnapshotSchema = AgentInferenceSnapshotV1Schema;
export type AgentInferenceSnapshot = z.infer<typeof AgentInferenceSnapshotSchema>;

/**
 * Read projection for persisted snapshots. Unknown versions remain available
 * as raw JSON instead of making the containing historical message unreadable.
 */
export const AgentInferenceSnapshotViewSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('supported'),
    snapshot: AgentInferenceSnapshotSchema,
  }),
  z.strictObject({
    status: z.literal('unsupported'),
    raw: JsonValueSchema,
  }),
]);
export type AgentInferenceSnapshotView = z.infer<typeof AgentInferenceSnapshotViewSchema>;

export function readAgentInferenceSnapshot(value: unknown): AgentInferenceSnapshotView | null {
  if (value === null || value === undefined) {
    return null;
  }
  const raw = JsonValueSchema.parse(value);
  const parsed = AgentInferenceSnapshotSchema.safeParse(raw);
  return parsed.success
    ? { status: 'supported', snapshot: parsed.data }
    : { status: 'unsupported', raw };
}

export const AgentSessionViewSchema = z.strictObject({
  id: z.string().min(1),
  agentId: z.string().min(1),
  executionTarget: AgentExecutionTargetSchema,
  title: z.string(),
  titleIsManual: z.boolean(),
  /**
   * Copied-message boundary after which the fork-origin divider is rendered.
   * Null for ordinary or pre-boundary Sessions, and cleared with fork lineage.
   */
  forkBoundaryMessageId: z.string().min(1).nullable(),
  /**
   * Fork provenance. Null for an ordinary Session, and reset to null when the
   * source Session is deleted, so a surviving fork never cites a Session the
   * user can no longer open.
   */
  forkedFromSessionId: z.string().min(1).nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type AgentSessionView = z.infer<typeof AgentSessionViewSchema>;

export const AgentFailureReasonSchema = z.enum([
  'auth',
  'permission',
  'region',
  'model_not_found',
  'quota',
  'rate_limit',
  'context_length',
  'payload_too_large',
  'network',
  'proxy_tls',
  'stream_interrupted',
  'content_filter',
  'provider_unavailable',
  'timeout',
  'invalid_input',
  'tool_limit',
  'tool_failed',
  'mcp',
  'parse',
  'internal',
  'unknown',
]);
export type AgentFailureReason = z.infer<typeof AgentFailureReasonSchema>;

export const AgentFailureSnapshotSchema = z.strictObject({
  version: z.literal(1),
  reasonCode: AgentFailureReasonSchema,
  source: z.strictObject({
    layer: z.enum(['provider', 'runtime', 'host', 'tool']),
    name: z.string().max(256).optional(),
    code: z.string().max(128).optional(),
  }),
  context: z
    .strictObject({
      statusCode: z.number().int().min(100).max(599).optional(),
      providerId: z.string().max(256).optional(),
      modelId: z.string().max(256).optional(),
      finishReason: z.string().max(256).optional(),
      responseBody: z.string().max(4_000).optional(),
    })
    .optional(),
});
export type AgentFailureSnapshot = z.infer<typeof AgentFailureSnapshotSchema>;

export const AgentErrorViewSchema = z
  .strictObject({
    code: z.enum([
      'AGENT_NOT_FOUND',
      'SESSION_NOT_FOUND',
      'MESSAGE_NOT_FOUND',
      'SESSION_BUSY',
      'CAPABILITY_UNSUPPORTED',
      'TOOL_CALLING_UNSUPPORTED',
      'ATTACHMENT_INVALID',
      'ATTACHMENT_UNAVAILABLE',
      'ATTACHMENT_METADATA_MISMATCH',
      'APPROVAL_NOT_FOUND',
      'EXECUTION_UNAVAILABLE',
      'EXECUTION_FAILED',
      'CANCELLED',
      'INTERRUPTED',
    ]),
    /**
     * Diagnostic text for logs and the error detail sheet. User-facing copy is
     * derived from `code` and `failure.reasonCode`; renderers never localize
     * this string or show it inline.
     */
    message: z.string(),
    retryable: z.boolean(),
    /** Present on newly persisted execution failures; optional for historical rows. */
    failure: AgentFailureSnapshotSchema.optional(),
  })
  .superRefine((error, context) => {
    if (error.failure !== undefined && error.code !== 'EXECUTION_FAILED') {
      context.addIssue({
        code: 'custom',
        message: 'Only EXECUTION_FAILED may carry an execution failure snapshot.',
        path: ['failure'],
      });
    }
  });
export type AgentErrorView = z.infer<typeof AgentErrorViewSchema>;

/** One submitted user input creates one turn and one assistant response. */
export const AgentTurnViewSchema = z.strictObject({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  status: z.enum([
    'running',
    'awaiting-approval',
    'cancelling',
    'completed',
    'failed',
    'cancelled',
    'interrupted',
  ]),
  assistantMessageId: z.string().min(1),
  error: AgentErrorViewSchema.nullable(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
});
export type AgentTurnView = z.infer<typeof AgentTurnViewSchema>;

export const AgentToolResultSchema = z.strictObject({
  value: JsonValueSchema,
  artifacts: z.array(
    z.strictObject({
      ref: z.strictObject({
        kind: z.literal('managed-file'),
        fileEntryId: z.string().min(1),
      }),
      mediaType: z.string(),
      name: z.string(),
      kind: z.enum(['created', 'derived']),
    }),
  ),
});

const TERMINAL_TOOL_STATES = new Set(['output-available', 'denied', 'error', 'interrupted']);

const DeniedToolResultSchema = z.strictObject({
  value: z.strictObject({ status: z.literal('denied'), reason: z.string() }),
  artifacts: z.tuple([]),
});
const ErrorToolResultSchema = z.strictObject({
  value: z.strictObject({
    status: z.literal('error'),
    error: z.strictObject({ code: z.string(), message: z.string(), retryable: z.boolean() }),
  }),
  artifacts: z.tuple([]),
});
const InterruptedToolResultSchema = z.strictObject({
  value: z.strictObject({ status: z.literal('interrupted'), reason: z.string() }),
  artifacts: z.tuple([]),
});

const AgentToolMessagePartSchema = z
  .strictObject({
    id: z.string().min(1),
    type: z.literal('tool'),
    toolCallId: z.string(),
    toolRef: AgentMessageToolRefSchema,
    providerName: z.string(),
    displayName: z.string(),
    state: z.enum([
      'input-streaming',
      'input-available',
      'awaiting-approval',
      'running',
      'output-available',
      'denied',
      'error',
      'interrupted',
    ]),
    input: JsonValueSchema.optional(),
    output: JsonValueSchema.optional(),
    approvalId: z.string().optional(),
    error: AgentErrorViewSchema.optional(),
  })
  .superRefine((part, context) => {
    if (!TERMINAL_TOOL_STATES.has(part.state)) {
      return;
    }
    const outputSchema =
      part.state === 'denied'
        ? DeniedToolResultSchema
        : part.state === 'error'
          ? ErrorToolResultSchema
          : part.state === 'interrupted'
            ? InterruptedToolResultSchema
            : AgentToolResultSchema;
    if (!outputSchema.safeParse(part.output).success) {
      context.addIssue({
        code: 'custom',
        message: 'Terminal tool output must be a RuntimeToolResult JSON projection.',
        path: ['output'],
      });
    }
  });

export const AgentMessagePartSchema = z.union([
  z.strictObject({
    id: z.string().min(1),
    type: z.enum(['text', 'reasoning']),
    text: z.string(),
    state: z.enum(['streaming', 'done']),
  }),
  z.strictObject({
    id: z.string().min(1),
    type: z.literal('file'),
    fileEntryId: z.string().min(1),
    mediaType: z.string(),
    name: z.string().optional(),
    purpose: z.enum(['input-attachment', 'artifact']),
  }),
  AgentToolMessagePartSchema,
  z.strictObject({
    id: z.string().min(1),
    type: z.literal('error'),
    error: AgentErrorViewSchema,
  }),
]);
export type AgentMessagePart = z.infer<typeof AgentMessagePartSchema>;

export const AgentUsageViewSchema = z.strictObject({
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  totalTokens: z.number().optional(),
});
export type AgentUsageView = z.infer<typeof AgentUsageViewSchema>;

export const AgentMessageViewSchema = z.strictObject({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  turnId: z.string().min(1).nullable(),
  role: z.enum(['user', 'assistant', 'system']),
  status: z.enum(['pending', 'streaming', 'success', 'error', 'cancelled', 'interrupted']),
  parts: z.array(AgentMessagePartSchema),
  usage: AgentUsageViewSchema.nullable(),
  stats: MessageStatsSchema.nullable(),
  modelId: UniqueModelIdSchema.nullable(),
  inferenceSnapshot: AgentInferenceSnapshotViewSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type AgentMessageView = z.infer<typeof AgentMessageViewSchema>;

export const AgentInputPartSchema = z.union([
  z.strictObject({ type: z.literal('text'), text: z.string() }),
  z.strictObject({
    type: z.literal('file'),
    fileEntryId: z.string().min(1),
    mediaType: z.string(),
    name: z.string().optional(),
  }),
]);
export type AgentInputPart = z.infer<typeof AgentInputPartSchema>;

export const AgentApprovalViewSchema = z.strictObject({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  turnId: z.string().min(1),
  toolCallId: z.string(),
  toolRef: AgentToolRefSchema,
  displayName: z.string(),
  input: JsonValueSchema,
  status: z.enum(['pending', 'approved', 'denied']),
});
export type AgentApprovalView = z.infer<typeof AgentApprovalViewSchema>;

/**
 * Projected on demand from the Session's current Agent configuration and the
 * Host's local Runtime binding. The client may branch on these flags, never on
 * Runtime identity. Cancellation is required by the Runtime contract and is
 * therefore not a capability flag.
 */
export const AgentCapabilitiesSchema = z.strictObject({
  reasoning: z.boolean(),
  tools: z.boolean(),
  approvals: z.boolean(),
  attachments: z.boolean(),
});
export type AgentCapabilities = z.infer<typeof AgentCapabilitiesSchema>;
