import * as z from 'zod';

export const AiFailureReasonSchema = z.enum([
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
export type AiFailureReason = z.infer<typeof AiFailureReasonSchema>;

export const AiFailureSnapshotSchema = z.strictObject({
  version: z.literal(1),
  reasonCode: AiFailureReasonSchema,
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
export type AiFailureSnapshot = z.infer<typeof AiFailureSnapshotSchema>;

/** Credential-free diagnostic facts shared by request and execution adapters. */
export type AiFailureInput = {
  code: string;
  message: string;
  retryable: boolean;
  origin?: AiFailureSnapshot['source']['layer'];
  name?: string;
  context?: AiFailureSnapshot['context'];
};
/** Expected request failure carried across AI capability boundaries. */
export class AiRequestError extends Error {
  constructor(
    readonly detail: { message: string; retryable: boolean; failure: AiFailureSnapshot },
  ) {
    super(detail.message);
    this.name = 'AiRequestError';
  }
}
