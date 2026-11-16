import type { TFunction } from 'i18next';

import {
  McpAuthorizationError,
  McpRedirectError,
  type McpConnectionFailure,
  type McpFailureDetail,
  type McpFailureKind,
  type McpFailureStage,
} from '@/shared/contracts/mcp';
import { DataApiError, ErrorCode } from '@/shared/data/api/errors';
import { readMcpFailureFacts } from '@/shared/data/api/mcpFailureFacts';

const REASON_KEYS = {
  'catalog-integrity': 'settings.mcp.failure.reason.catalogIntegrity',
  timeout: 'settings.mcp.failure.reason.timeout',
  'refused-or-unreachable': 'settings.mcp.failure.reason.unreachable',
  'http-status': 'settings.mcp.failure.reason.http',
  'protocol-handshake': 'settings.mcp.failure.reason.protocol',
  'auth-required': 'settings.mcp.failure.reason.auth',
  redirect: 'settings.mcp.failure.reason.redirect',
  'size-limit': 'settings.mcp.failure.reason.size',
  'missing-identity': 'settings.mcp.failure.reason.identity',
  unknown: 'settings.mcp.failure.reason.unknown',
} as const satisfies Record<McpFailureKind, string>;
const STAGE_KEYS = {
  negotiation: 'settings.mcp.failure.stage.negotiation',
  initialize: 'settings.mcp.failure.stage.initialize',
  'tools-list': 'settings.mcp.failure.stage.tools',
} as const satisfies Record<McpFailureStage, string>;
const SAVE_KEYS = {
  validation: 'settings.mcp.failure.save.validation',
  authorization: 'settings.mcp.failure.save.authorization',
  connection: 'settings.mcp.failure.save.connection',
  persistence: 'settings.mcp.failure.save.persistence',
} as const;
const ACTION_KEYS = {
  disconnect: 'settings.mcp.failure.action.disconnect',
  enable: 'settings.mcp.failure.action.enable',
  disable: 'settings.mcp.failure.action.disable',
  'tool-toggle': 'settings.mcp.failure.action.toolToggle',
} as const;
const AUTH_KEYS = {
  configuration: 'settings.mcp.oauth.errors.configuration',
  unavailable: 'settings.mcp.oauth.errors.unavailable',
  cancelled: 'settings.mcp.failure.reason.authorization',
  network: 'settings.mcp.oauth.errors.network',
  reauthorize: 'settings.mcp.oauth.errors.reauthorize',
  invalid_response: 'settings.mcp.oauth.errors.invalid_response',
} as const satisfies Record<McpAuthorizationError['code'], string>;

function readDetail(value: unknown): McpFailureDetail | undefined {
  if (
    !value ||
    typeof value !== 'object' ||
    !('stage' in value) ||
    typeof value.stage !== 'string' ||
    !Object.hasOwn(STAGE_KEYS, value.stage)
  )
    return undefined;
  const numberFact = (key: 'httpStatus' | 'protocolCode' | 'timeoutMs') => {
    const fact = (value as Record<string, unknown>)[key];
    return typeof fact === 'number' && Number.isFinite(fact) ? fact : undefined;
  };
  return {
    stage: value.stage as McpFailureStage,
    kind:
      'kind' in value && typeof value.kind === 'string' && Object.hasOwn(REASON_KEYS, value.kind)
        ? (value.kind as McpFailureKind)
        : 'unknown',
    httpStatus: numberFact('httpStatus'),
    protocolCode: numberFact('protocolCode'),
    timeoutMs: numberFact('timeoutMs'),
  };
}

export function readConnectionFailure(error: unknown): McpConnectionFailure | undefined {
  const seen = new Set<object>();
  let current = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const value =
      readMcpFailureFacts(current) ??
      ('connectionFailure' in current ? current.connectionFailure : undefined);
    const failure = readFailure(value);
    if (failure) return failure;
    current = 'cause' in current ? current.cause : undefined;
  }
  return undefined;
}

function readFailure(value: unknown): McpConnectionFailure | undefined {
  const detail = readDetail(value);
  if (!detail) return undefined;
  if (
    value &&
    typeof value === 'object' &&
    'fallback' in value &&
    value.fallback &&
    typeof value.fallback === 'object' &&
    'negotiation' in value.fallback &&
    'legacy' in value.fallback
  ) {
    const negotiation = readDetail(value.fallback.negotiation);
    const legacy = readDetail(value.fallback.legacy);
    if (negotiation && legacy) return { ...detail, fallback: { negotiation, legacy } };
  }
  return detail;
}

function describeDetail(failure: McpFailureDetail, t: TFunction): string {
  // Even typed facts can come from an older runtime. Never interpolate untrusted text.
  const detail = readDetail(failure);
  if (!detail) return t('settings.mcp.failure.reason.unknown');
  let reason = t(REASON_KEYS[detail.kind]);
  if (detail.kind === 'http-status' && detail.httpStatus !== undefined)
    reason = t('settings.mcp.failure.reason.httpStatus', { httpStatus: detail.httpStatus });
  if (detail.kind === 'auth-required' && detail.httpStatus !== undefined)
    reason = t('settings.mcp.failure.reason.authStatus', { httpStatus: detail.httpStatus });
  if (detail.kind === 'protocol-handshake' && detail.stage === 'tools-list')
    reason = t('settings.mcp.failure.reason.toolListing');
  if (
    detail.kind === 'protocol-handshake' &&
    detail.stage !== 'tools-list' &&
    detail.protocolCode !== undefined
  )
    reason = t('settings.mcp.failure.reason.protocolCode', { protocolCode: detail.protocolCode });
  if (detail.kind === 'timeout' && detail.timeoutMs !== undefined)
    reason = t('settings.mcp.failure.reason.timeoutMs', { timeoutMs: detail.timeoutMs });
  return t('settings.mcp.failure.atStage', { reason, stage: t(STAGE_KEYS[detail.stage]) });
}

export function describeConnectionFailure(failure: McpConnectionFailure, t: TFunction): string {
  return failure.fallback
    ? t('settings.mcp.failure.fallback', {
        negotiation: describeDetail(failure.fallback.negotiation, t),
        legacy: describeDetail(failure.fallback.legacy, t),
      })
    : describeDetail(failure, t);
}

function describeWriteFailure(error: unknown, t: TFunction): string {
  if (error instanceof DataApiError) {
    if (error.code === ErrorCode.CONFLICT) {
      if (error.details?.reason === 'duplicate-name')
        return t('settings.mcp.failure.reason.duplicate');
      if (error.details?.reason === 'connection-changed')
        return t('settings.mcp.failure.reason.connectionChanged');
    }
    if (error.code === ErrorCode.VALIDATION_ERROR) return t('settings.mcp.failure.reason.invalid');
  }
  return t('settings.mcp.failure.reason.write');
}

export function describeSaveFailure(
  step: keyof typeof SAVE_KEYS,
  error: unknown,
  t: TFunction,
): string {
  let reason: string;
  if (step === 'persistence') reason = describeWriteFailure(error, t);
  else if (step === 'validation') {
    reason = t('settings.mcp.failure.reason.invalid');
    if (error && typeof error === 'object' && 'errorKey' in error) {
      if (error.errorKey === 'settings.mcp.fields.endpointUrlInvalid')
        reason = t('settings.mcp.fields.endpointUrlInvalid');
      if (error.errorKey === 'settings.mcp.fields.headersInvalid')
        reason = t('settings.mcp.fields.headersInvalid');
    }
  } else if (error instanceof McpRedirectError) reason = t('settings.mcp.failure.reason.redirect');
  else {
    const failure = readConnectionFailure(error);
    reason = failure
      ? describeConnectionFailure(failure, t)
      : error instanceof McpAuthorizationError
        ? t(AUTH_KEYS[error.code])
        : t(
            step === 'authorization'
              ? 'settings.mcp.failure.reason.authorization'
              : 'settings.mcp.failure.reason.unknown',
          );
  }
  return t(SAVE_KEYS[step], { reason });
}

export function describeMcpActionFailure(
  action: keyof typeof ACTION_KEYS,
  error: unknown,
  t: TFunction,
): string {
  const failure = readConnectionFailure(error);
  const reason =
    error instanceof McpRedirectError
      ? t('settings.mcp.failure.reason.redirect')
      : failure
        ? describeConnectionFailure(failure, t)
        : describeWriteFailure(error, t);
  return t(ACTION_KEYS[action], { reason });
}
