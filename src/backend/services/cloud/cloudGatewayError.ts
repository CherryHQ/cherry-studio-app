import * as z from 'zod';

import { readProviderErrorDiagnostics } from '@/shared/utils/providerDiagnostics';

const gatewayCodeSchema = z.enum([
  'ACCOUNT_DISABLED',
  'ENTITLEMENT_INACTIVE',
  'CONCURRENCY_LIMITED',
  'QUOTA_EXHAUSTED',
  'UPSTREAM_UNAVAILABLE',
  'CLOUD_SERVICE_UNAVAILABLE',
  'AUTH_REQUIRED',
  'SESSION_EXPIRED',
  'REAUTH_REQUIRED',
  'REQUEST_REPLAYED',
  'AMD_ACTIVATION_REQUIRED',
  'AMD_CREDENTIAL_INVALID',
  'AMD_ACCESS_DENIED',
  'MODEL_UNAVAILABLE',
  'RATE_LIMITED',
]);
const gatewayErrorSchema = z.object({
  code: gatewayCodeSchema.optional().catch(undefined),
  error: z.object({ code: gatewayCodeSchema.optional() }).optional().catch(undefined),
});

export function readCloudGatewayCode(body: unknown) {
  const data = gatewayErrorSchema.safeParse(body);
  if (!data.success) return undefined;
  return data.data.error?.code ?? data.data.code;
}

const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 30_000;

export function cloudRetryDeadline(retryAfter: string | null | undefined, now: number): number {
  const fallback = now + DEFAULT_RATE_LIMIT_COOLDOWN_MS;
  const value = retryAfter?.trim();
  if (!value) return fallback;
  const isSeconds = /^\d+$/.test(value);
  // Date.parse also accepts malformed delta-seconds such as "-1" as calendar dates.
  if (!isSeconds && Number.isFinite(Number(value))) return fallback;
  const deadline = isSeconds ? now + Number(value) * 1000 : Date.parse(value);
  return Number.isFinite(deadline) ? Math.max(deadline, now) : fallback;
}

export function readCloudUpstreamErrorBody(body: unknown): string | undefined {
  const { providerCode, providerType, parameter } = readProviderErrorDiagnostics(body);
  if (!providerCode && !providerType && !parameter) return undefined;
  return JSON.stringify({
    error: {
      ...(providerCode ? { code: providerCode } : {}),
      ...(providerType ? { type: providerType } : {}),
      ...(parameter ? { param: parameter } : {}),
    },
  });
}

export class CloudGatewayRequestError extends Error {
  readonly retryable = false;

  constructor(
    readonly statusCode: number,
    readonly code: string,
    readonly gatewayRequestId?: string,
    readonly body?: string,
  ) {
    super(`Cloud request failed (${statusCode}) ${code}`);
    this.name = 'CloudGatewayRequestError';
  }
}

export function cloudSessionIssue(status: number | undefined, code: string | undefined) {
  if (status !== 401) return undefined;
  return code === 'ACCOUNT_DISABLED' ? ('account_disabled' as const) : ('reauth_required' as const);
}
