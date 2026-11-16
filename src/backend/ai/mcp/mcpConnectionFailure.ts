/** Safe settings projections: lastError is always app-authored, never upstream text. */
import {
  InsufficientScopeError,
  ProtocolError,
  SdkError,
  SdkErrorCode,
} from '@modelcontextprotocol/client';

import {
  McpAuthorizationError,
  McpLegacyFallbackError,
  McpRedirectError,
  type McpConnectionFailure,
  type McpFailureDetail,
  type McpFailureStage,
} from '@/shared/contracts/mcp';
import { attachMcpFailureFacts, readMcpFailureFacts } from '@/shared/data/api/mcpFailureFacts';

/** Distinguishes the runtime deadline from caller cancellation. */
export class McpTimeoutError extends Error {}

const transportFailures = new WeakSet<object>();

export function markTransportFailure(error: unknown): void {
  if (error && typeof error === 'object') transportFailures.add(error);
}
export const MCP_CONNECTION_ERROR_KIND = Symbol('mcpConnectionErrorKind');

export const attachMcpConnectionFailure = attachMcpFailureFacts;
export const readMcpConnectionFailure = readMcpFailureFacts;

export function formatMcpDiscoveryWarningSummary(): string {
  return 'MCP server connected, but part of the catalog was skipped.';
}

export function normalizeMcpConnectionFailure(
  error: unknown,
  context: {
    stage: McpFailureStage;
    didTimeout: boolean;
    timeoutMs: number;
    readFacts?: (error: object) => McpConnectionFailure | undefined;
    isTransportFailure?: (error: object) => boolean;
  },
): McpConnectionFailure {
  const visit = (
    value: unknown,
    stage: McpFailureStage,
    visited = new Set<object>(),
  ): McpConnectionFailure => {
    if (!value || typeof value !== 'object' || visited.has(value) || visited.size >= 32)
      return { stage, kind: 'unknown' };
    visited.add(value);
    const captured = (context.readFacts ?? readMcpFailureFacts)(value);
    if (captured) return captured;
    const item = value as {
      cause?: unknown;
      status?: unknown;
      code?: unknown;
      [MCP_CONNECTION_ERROR_KIND]?: 'size-limit' | 'missing-identity';
    };
    if (value instanceof McpLegacyFallbackError) {
      const negotiation = visit(value.negotiationError, 'negotiation', new Set(visited));
      const legacy = visit(value.cause, 'initialize', new Set(visited));
      // Prefer the concrete legacy rejection over a generic probe failure; retain both facts.
      const detail = legacy.kind !== 'unknown' ? legacy : negotiation;
      return {
        ...detail,
        fallback: { negotiation, legacy },
      };
    }
    const httpStatus =
      typeof item.status === 'number' &&
      Number.isInteger(item.status) &&
      item.status >= 100 &&
      item.status <= 599
        ? item.status
        : undefined;
    const protocolCode =
      ProtocolError.isInstance(value) && Number.isSafeInteger(value.code) ? value.code : undefined;
    let kind: McpFailureDetail['kind'] = 'unknown';
    if (
      value instanceof McpAuthorizationError ||
      value instanceof InsufficientScopeError ||
      (SdkError.isInstance(value) &&
        (value.code === SdkErrorCode.ClientHttpAuthentication ||
          value.code === SdkErrorCode.ClientHttpForbidden)) ||
      httpStatus === 401 ||
      httpStatus === 403
    )
      kind = 'auth-required';
    else if (value instanceof McpRedirectError) kind = 'redirect';
    else if (
      item[MCP_CONNECTION_ERROR_KIND] === 'size-limit' ||
      item[MCP_CONNECTION_ERROR_KIND] === 'missing-identity'
    )
      kind = item[MCP_CONNECTION_ERROR_KIND];
    else if (httpStatus !== undefined) kind = 'http-status';
    else if (protocolCode !== undefined) kind = 'protocol-handshake';
    else if (
      value instanceof McpTimeoutError ||
      item.code === 'ETIMEDOUT' ||
      (SdkError.isInstance(value) && value.code === SdkErrorCode.RequestTimeout)
    )
      kind = 'timeout';
    else if (
      (context.isTransportFailure ?? ((error) => transportFailures.has(error)))(value) ||
      (typeof item.code === 'string' &&
        ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(item.code))
    )
      kind = 'refused-or-unreachable';
    const nested = visit(item.cause, stage, visited);
    if (
      kind === 'unknown' ||
      (kind === 'refused-or-unreachable' &&
        (nested.httpStatus !== undefined || nested.kind === 'timeout'))
    )
      return nested;
    return {
      stage,
      kind,
      ...(httpStatus !== undefined ? { httpStatus } : {}),
      ...(protocolCode !== undefined ? { protocolCode } : {}),
    };
  };
  const detail = visit(error, context.stage);
  if (context.didTimeout) {
    const timeout = {
      stage: context.stage,
      kind: 'timeout' as const,
      ...(Number.isSafeInteger(context.timeoutMs) && context.timeoutMs >= 0
        ? { timeoutMs: context.timeoutMs }
        : {}),
    };
    return {
      ...timeout,
      ...(detail.fallback
        ? {
            fallback: {
              ...detail.fallback,
              ...(context.stage === 'initialize' && detail.fallback.legacy.kind === 'unknown'
                ? { legacy: timeout }
                : {}),
              ...(context.stage === 'negotiation' && detail.fallback.negotiation.kind === 'unknown'
                ? { negotiation: timeout }
                : {}),
            },
          }
        : {}),
    };
  }
  return detail;
}

export function formatMcpConnectionFailureSummary(failure: McpConnectionFailure): string {
  const describe = (detail: McpFailureDetail): string => {
    const descriptions = {
      timeout:
        detail.timeoutMs === undefined ? 'timed out' : `timed out after ${detail.timeoutMs}ms`,
      'refused-or-unreachable': 'endpoint refused or unreachable',
      'http-status': 'HTTP request rejected',
      'protocol-handshake':
        detail.protocolCode === undefined
          ? 'protocol handshake rejected'
          : `protocol error ${detail.protocolCode}`,
      'auth-required': 'authorization required',
      redirect: 'endpoint redirected',
      'size-limit': 'response size limit exceeded',
      'missing-identity': 'server identity missing',
      'catalog-integrity': 'catalog integrity check failed',
      unknown: 'unknown failure',
    };
    return `${detail.httpStatus === undefined ? descriptions[detail.kind] : `HTTP ${detail.httpStatus}`} during ${detail.stage}`;
  };
  return failure.fallback
    ? `MCP connection failed: negotiation attempt: ${describe(failure.fallback.negotiation)}; legacy attempt: ${describe(failure.fallback.legacy)}.`
    : `MCP connection failed: ${describe(failure)}.`;
}
