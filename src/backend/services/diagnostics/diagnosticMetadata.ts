import { diagnosticIdentifier } from '@/backend/utils/diagnosticIdentifier';
import { traceErrorAttributes } from '@/backend/utils/diagnosticTrace';
import { TraceSpanRecordSchema } from '@/shared/data/types/trace';

const LOG_MESSAGES = new Set([
  'Uncaught JavaScript exception',
  'Unhandled promise rejection',
  'Promise rejection handled',
  'Agent turn reached a failed terminal state',
  'Agent turn failed outside the runtime event stream',
  'Agent streaming message write failed; recovery fidelity reduced',
  'HTTP request failed.',
  'HTTP transport failed unexpectedly.',
  'MCP tools() failed, reconnecting once',
  'Trace storage operation failed',
  'Device tool failed',
]);
const LOG_STRING_FIELDS = new Set([
  'code',
  'reasonCode',
  'sourceCode',
  'sourceLayer',
  'operation',
  'capabilityId',
  'modelId',
  'providerId',
  'sessionId',
  'turnId',
  'assistantMessageId',
  'serverId',
  'requestId',
]);
const LOG_NUMBER_FIELDS = new Set([
  'status',
  'statusCode',
  'durationMs',
  'totalTokens',
  'writeFailures',
  'droppedRecords',
]);
const TRACE_FIELDS = new Set([
  'error.type',
  'error.code',
  'error.origin',
  'error.retryable',
  'error.category',
  'http.status_code',
  'plugin.error.reason',
  'plugin.error.code',
  'plugin.id',
  'plugin.auth.method',
  'plugin.stage',
  'plugin.state',
  'gen_ai.request.model',
  'gen_ai.provider.id',
  'gen_ai.provider.api',
  'gen_ai.response.finish_reason',
  'mcp.server.id',
  'mcp.connection.generation',
  'mcp.connection.temporary',
  'mcp.tools_count',
  'tool.name',
  'tool.call.id',
  'host.error.code',
  'trace.dropped_spans',
  'trace.attributes_truncated',
]);

function metadataValue(value: unknown): string | number | boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  return diagnosticIdentifier(value);
}

function projectRepetition(value: unknown, timestamp: string) {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  if (
    typeof source.count !== 'number' ||
    !Number.isSafeInteger(source.count) ||
    source.count < 1 ||
    typeof source.firstSeenAt !== 'string' ||
    typeof source.lastSeenAt !== 'string'
  )
    return undefined;
  const first = Date.parse(source.firstSeenAt);
  const last = Date.parse(source.lastSeenAt);
  if (
    !Number.isFinite(first) ||
    !Number.isFinite(last) ||
    first > last ||
    last !== Date.parse(timestamp)
  )
    return undefined;
  return {
    count: source.count,
    firstSeenAt: new Date(first).toISOString(),
    lastSeenAt: new Date(last).toISOString(),
  };
}

/** Drop arbitrary log messages and nested payloads before any persistent write. */
export function projectDiagnosticLog(record: Record<string, unknown>) {
  if (record.level !== 'warn' && record.level !== 'error') return undefined;
  if (typeof record.timestamp !== 'string' || !Number.isFinite(Date.parse(record.timestamp)))
    return undefined;
  const facts: Record<string, string | number | boolean> = {};
  const context = record.context && typeof record.context === 'object' ? record.context : {};
  for (const [key, value] of Object.entries(
    Object.assign(
      {},
      context,
      ...(Array.isArray(record.data)
        ? record.data.filter((value) => value && typeof value === 'object')
        : []),
      record,
    ),
  )) {
    if (LOG_STRING_FIELDS.has(key)) {
      const identifier = diagnosticIdentifier(value);
      if (identifier) facts[key] = identifier;
    } else if (LOG_NUMBER_FIELDS.has(key) && typeof value === 'number' && Number.isFinite(value)) {
      facts[key] = value;
    } else if ((key === 'retryable' || key === 'isFatal') && typeof value === 'boolean') {
      facts[key] = value;
    }
  }
  // Re-project persisted facts too, so export never copies arbitrary JSON through this boundary.
  const errorFacts =
    record.capture === 'metadata' ? record.facts : traceErrorAttributes(record.error ?? record);
  if (errorFacts && typeof errorFacts === 'object') {
    for (const [key, value] of Object.entries(errorFacts)) {
      if (
        !TRACE_FIELDS.has(key) &&
        !LOG_STRING_FIELDS.has(key) &&
        !LOG_NUMBER_FIELDS.has(key) &&
        key !== 'retryable' &&
        key !== 'isFatal'
      )
        continue;
      const safe = metadataValue(value);
      if (safe !== undefined) facts[key] = safe;
    }
  }
  return {
    schemaVersion: 1,
    capture: 'metadata' as const,
    timestamp: new Date(record.timestamp).toISOString(),
    level: record.level,
    module: diagnosticIdentifier(record.module) ?? 'unknown',
    message:
      typeof record.message === 'string' && LOG_MESSAGES.has(record.message)
        ? record.message
        : record.level === 'error'
          ? 'Application error'
          : 'Application warning',
    facts,
    repetition:
      record.capture === 'metadata'
        ? projectRepetition(record.repetition, record.timestamp)
        : undefined,
  };
}

/** Only the documented request metadata crosses the archive boundary. */
export function projectDiagnosticTrace(value: unknown) {
  const parsed = TraceSpanRecordSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const record = parsed.data;
  if (
    !/^(?:ai\.turn|pi\.generate_content|mcp\.(?:connect|list_tools|call_tool)|plugin\.[a-z_]+)$/.test(
      record.name,
    )
  )
    return undefined;
  const attributes: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(record.attributes)) {
    if (!TRACE_FIELDS.has(key)) continue;
    const safe = metadataValue(value);
    if (safe !== undefined) attributes[key] = safe;
  }
  return {
    ...record,
    processId: diagnosticIdentifier(record.processId) ?? 'unknown',
    context: Object.fromEntries(
      Object.entries(record.context).flatMap(([key, value]) => {
        const safe = diagnosticIdentifier(value);
        return safe ? [[key, safe]] : [];
      }),
    ),
    attributes,
  };
}
