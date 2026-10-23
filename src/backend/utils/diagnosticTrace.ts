import { AiFailureReasonSchema } from '@/shared/contracts/aiFailure';
import { PluginError } from '@/shared/contracts/plugins';
import type { TraceContext, TraceSpanStatus } from '@/shared/data/types/trace';

import { diagnosticIdentifier } from './diagnosticIdentifier';

export type TraceAttributes = Record<string, string | number | boolean | undefined>;
export type TraceEndStatus = Exclude<TraceSpanStatus, 'running'>;

/** Explicit parents keep concurrent mobile turns isolated without a global async context. */
export interface TraceSpan {
  readonly traceId: string;
  readonly spanId: string;
  startSpan(name: string, attributes?: TraceAttributes): TraceSpan | undefined;
  setAttributes(attributes: TraceAttributes): void;
  end(status: TraceEndStatus, attributes?: TraceAttributes): void;
}

/** All producer methods are best effort and must never throw into the operation being traced. */
export interface TraceRecorder {
  startTrace(
    name: string,
    context?: TraceContext,
    attributes?: TraceAttributes,
  ): TraceSpan | undefined;
  flush(): Promise<void>;
}

export type TraceDiagnosticSnapshot = {
  directoryUri: string;
  files: { name: string; uri: string; size: number }[];
  metadata: {
    capture: 'metadata';
    retention: { maxAgeMs: number; maxBytes: number; maxFiles: number };
    diagnostics: TraceStorageDiagnostics;
  };
  /** The diagnostic-package owner releases its private snapshot after consuming it. */
  dispose(): void;
};

export type TraceStorageDiagnostics = {
  droppedRecords: number;
  writeFailures: number;
};

const PLUGIN_REASONS = new Set([
  'unavailable',
  'authorization',
  'access',
  'quota',
  'network',
  'request',
  'unknown-write',
  'cancelled',
  'storage',
  'requires-disconnect',
]);

const SENSITIVE_KEY =
  /authorization|cookie|credential|password|secret|api.?key|access.?token|refresh.?token|prompt|input|output|body|header/i;
const MAX_TRACE_ATTRIBUTES = 24;

export function sanitizeTraceAttributes(
  attributes: TraceAttributes = {},
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  let count = 0;
  for (const [key, value] of Object.entries(attributes)) {
    if (SENSITIVE_KEY.test(key) && !(typeof value === 'number' && /tokens|count|bytes/i.test(key)))
      continue;
    let safe: string | number | boolean;
    if (typeof value === 'string') {
      const identifier = diagnosticIdentifier(value);
      if (!identifier) continue;
      safe = identifier;
    } else if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))
      safe = value;
    else continue;
    if (count === MAX_TRACE_ATTRIBUTES) {
      result['trace.attributes_truncated'] = true;
      break;
    }
    result[key.slice(0, 64)] = safe;
    count += 1;
  }
  return result;
}

/** Error messages, causes, stacks, and response bodies can contain user content or credentials. */
export function traceErrorAttributes(error: unknown): TraceAttributes {
  try {
    if (!error || typeof error !== 'object') return {};
    const source = error as Record<string, unknown>;
    // Agent errors wrap the product reason and original provider facts in a failure snapshot.
    const failure = record(source.failure);
    const failureSource = record(failure?.source);
    const productReason = failure ? AiFailureReasonSchema.safeParse(failure.reasonCode) : undefined;
    const context = record(source.context) ?? record(failure?.context);
    const name = source.name ?? failureSource?.name;
    const origin = source.origin ?? failureSource?.layer;
    return sanitizeTraceAttributes({
      'error.type': typeof name === 'string' ? name : undefined,
      'error.code':
        typeof source.code === 'string' || typeof source.code === 'number'
          ? source.code
          : undefined,
      'error.source.code': typeof failureSource?.code === 'string' ? failureSource.code : undefined,
      'error.product_reason': productReason?.success ? productReason.data : undefined,
      'error.origin': typeof origin === 'string' ? origin : undefined,
      'error.retryable': typeof source.retryable === 'boolean' ? source.retryable : undefined,
      'plugin.error.reason':
        error instanceof PluginError
          ? error.reason
          : typeof context?.pluginReason === 'string' && PLUGIN_REASONS.has(context.pluginReason)
            ? context.pluginReason
            : undefined,
      'plugin.error.code':
        typeof context?.providerCode === 'number' ? context.providerCode : undefined,
      'http.status_code':
        typeof source.statusCode === 'number'
          ? source.statusCode
          : typeof source.status === 'number'
            ? source.status
            : typeof context?.statusCode === 'number'
              ? context.statusCode
              : undefined,
    });
  } catch {
    return {};
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}
