import type { AgentFailureReason } from '@/shared/contracts/agent';

export type AgentFailureFacts = {
  code?: string;
  finishReason?: string;
  message: string;
  name?: string;
  responseBody?: string;
  statusCode?: number;
};

const CODE_REASONS: Readonly<Partial<Record<string, AgentFailureReason>>> = {
  authentication_error: 'auth',
  content_filter: 'content_filter',
  context_length_exceeded: 'context_length',
  duplicate_tool_call_id: 'tool_failed',
  econnrefused: 'network',
  econnreset: 'stream_interrupted',
  enotfound: 'network',
  etimedout: 'timeout',
  forbidden: 'permission',
  host_error: 'internal',
  insufficient_credit: 'quota',
  insufficient_quota: 'quota',
  invalid_api_key: 'auth',
  invalid_json: 'parse',
  mcp_error: 'mcp',
  missing_terminal_event: 'internal',
  model_not_found: 'model_not_found',
  permission_denied: 'permission',
  provider_unavailable: 'provider_unavailable',
  rate_limit_error: 'rate_limit',
  rate_limit_exceeded: 'rate_limit',
  request_too_large: 'payload_too_large',
  tool_call_limit_exceeded: 'tool_limit',
  tool_execution_error: 'tool_failed',
  tool_step_limit_exceeded: 'tool_limit',
  turn_timeout: 'timeout',
  unsupported_approval: 'invalid_input',
  unsupported_input: 'invalid_input',
  unsupported_tool: 'invalid_input',
  unsupported_tools: 'invalid_input',
};

function includesAny(text: string, values: readonly string[]): boolean {
  return values.some((value) => text.includes(value));
}

/**
 * Stable product classification derived from allowlisted failure facts.
 * Explicit source codes and HTTP status win over provider-message heuristics.
 */
export function classifyAgentFailureReason(facts: AgentFailureFacts): AgentFailureReason {
  const code = facts.code?.trim().toLowerCase();
  const codeReason = code ? CODE_REASONS[code] : undefined;
  if (codeReason) {
    return codeReason;
  }

  const finishReason = facts.finishReason?.trim().toLowerCase();
  if (
    finishReason &&
    ['content-filter', 'content_filter', 'safety', 'recitation'].includes(finishReason)
  ) {
    return 'content_filter';
  }

  const text = [facts.name, facts.message, facts.responseBody]
    .filter((value): value is string => Boolean(value))
    .join('\n')
    .toLowerCase();
  const embeddedStatus = text.match(
    /\b(?:status(?: code)?|http|api error)\D{0,12}([1-5]\d{2})\b/u,
  )?.[1];
  const leadingStatus = text.match(/(?:^|\n)\s*([1-5]\d{2})(?=\s|:|$)/u)?.[1];
  const statusCode = facts.statusCode ?? (embeddedStatus ? Number(embeddedStatus) : undefined);
  const resolvedStatusCode = statusCode ?? (leadingStatus ? Number(leadingStatus) : undefined);

  if (
    includesAny(text, [
      'unsupported_country',
      'country, region',
      'country/region',
      'region not supported',
      'not available in your region',
      'not available in your country',
      'not available in your location',
      'not available in your territory',
    ])
  ) {
    return 'region';
  }

  if (
    resolvedStatusCode === 401 ||
    includesAny(text, [
      'invalid_api_key',
      'authentication',
      'unauthorized',
      'requires an api key',
      'no api key',
      'api key is missing',
      'api key was not provided',
      'incorrect api key',
    ])
  ) {
    return 'auth';
  }
  if (
    resolvedStatusCode === 404 ||
    includesAny(text, ['model_not_found', 'model not found', 'model does not exist']) ||
    (text.includes('model with id') && text.includes('not found'))
  ) {
    return 'model_not_found';
  }
  if (
    resolvedStatusCode === 402 ||
    includesAny(text, [
      'quota',
      'insufficient_balance',
      'insufficient balance',
      'insufficient_credit',
      'insufficient credit',
      'billing',
      'payment',
    ])
  ) {
    return 'quota';
  }
  if (resolvedStatusCode === 403 || includesAny(text, ['forbidden', 'access denied'])) {
    return 'permission';
  }
  if (
    resolvedStatusCode === 429 ||
    includesAny(text, ['rate_limit', 'rate limit', 'too many requests'])
  ) {
    return 'rate_limit';
  }
  if (resolvedStatusCode === 408) {
    return 'timeout';
  }
  if (
    includesAny(text, [
      'context_length_exceeded',
      'too many tokens',
      'maximum context length',
      'context window',
      'prompt is too long',
      'input is too long',
    ])
  ) {
    return 'context_length';
  }
  if (
    resolvedStatusCode === 413 ||
    includesAny(text, ['payload too large', 'request entity too large'])
  ) {
    return 'payload_too_large';
  }
  if (
    resolvedStatusCode === 529 ||
    (resolvedStatusCode !== undefined && resolvedStatusCode >= 500) ||
    includesAny(text, ['overloaded', 'overload'])
  ) {
    return 'provider_unavailable';
  }
  if (
    includesAny(text, [
      'content_filter',
      'content_policy',
      'prohibited_content',
      'responsible_ai',
      'output_blocked',
      'blocked by safety',
      'recitation',
    ])
  ) {
    return 'content_filter';
  }
  if (
    includesAny(text, [
      'mcp server',
      'mcp connection',
      'mcp error',
      'mcp timeout',
      'mcp transport',
      'mcp client',
      '[mcp]',
      'mcp_',
    ]) ||
    text.startsWith('mcp:')
  ) {
    return 'mcp';
  }
  if (
    includesAny(text, [
      'econnreset',
      'connection reset',
      'stream interrupted',
      'stream closed',
      'stream aborted',
      'stream ended unexpectedly',
      'premature close',
    ])
  ) {
    return 'stream_interrupted';
  }
  if (
    includesAny(text, [
      'proxy',
      'socks',
      'certificate',
      'self-signed',
      'unable_to_verify_leaf_signature',
    ])
  ) {
    return 'proxy_tls';
  }
  if (
    includesAny(text, [
      'econnrefused',
      'etimedout',
      'network',
      'fetch failed',
      'enotfound',
      'connection failed',
    ])
  ) {
    return 'network';
  }
  if (text.includes('timeout') || text.includes('timed out')) {
    return 'timeout';
  }
  if (
    includesAny(text, [
      'unexpected token',
      'invalid response',
      'parse error',
      'failed to parse',
      'json parse',
      'invalid json',
      'malformed json',
    ])
  ) {
    return 'parse';
  }
  return 'unknown';
}
