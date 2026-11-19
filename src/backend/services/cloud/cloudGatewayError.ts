import * as z from 'zod';

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

export function cloudRetryDeadline(retryAfter: string | null, now: number): number {
  if (!retryAfter) return now;
  const value = retryAfter.trim();
  const deadline = /^\d+$/.test(value) ? now + Number(value) * 1000 : Date.parse(value);
  return Number.isFinite(deadline) && deadline > now ? deadline : now;
}

export class CloudGatewayRequestError extends Error {
  readonly retryable = false;

  constructor(
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(`Cloud request failed (${statusCode}) ${code}`);
    this.name = 'CloudGatewayRequestError';
  }
}

export function cloudSessionIssue(status: number | undefined, code: string | undefined) {
  if (status !== 401) return undefined;
  return code === 'ACCOUNT_DISABLED' ? ('account_disabled' as const) : ('reauth_required' as const);
}
