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

export function sanitizeTraceAttributes(
  attributes: TraceAttributes = {},
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(attributes).slice(0, 24)) {
    if (SENSITIVE_KEY.test(key) && !(typeof value === 'number' && /tokens|count|bytes/i.test(key)))
      continue;
    if (typeof value === 'string') {
      const identifier = diagnosticIdentifier(value);
      if (identifier) result[key.slice(0, 64)] = identifier;
    } else if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))
      result[key.slice(0, 64)] = value;
  }
  return result;
}

/** Error messages, causes, stacks, and response bodies can contain user content or credentials. */
export function traceErrorAttributes(error: unknown): TraceAttributes {
  try {
    if (!error || typeof error !== 'object') return {};
    const source = error as Record<string, unknown>;
    const context =
      source.context && typeof source.context === 'object'
        ? (source.context as Record<string, unknown>)
        : undefined;
    return sanitizeTraceAttributes({
      'error.type': typeof source.name === 'string' ? source.name : undefined,
      'error.code':
        typeof source.code === 'string' || typeof source.code === 'number'
          ? source.code
          : undefined,
      'error.origin': typeof source.origin === 'string' ? source.origin : undefined,
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
