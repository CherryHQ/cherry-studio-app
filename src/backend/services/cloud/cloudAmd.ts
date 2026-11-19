import * as z from 'zod';

import { CloudAccessError } from '@/shared/contracts/cloud';

export const CLOUD_AMD_STATUS_PATH = '/api/v1/amd/desktop/status';
/** Product credentials may be sent only to the relative API target advertised by this model. */
export function cloudActivationPath(target: string | null | undefined, origin: string): string {
  if (!target?.startsWith('/') || target.startsWith('//') || /[\\#\s]/.test(target))
    throw new CloudAccessError('unavailable');
  const url = new URL(target, origin);
  if (url.origin !== origin || url.pathname + url.search !== target)
    throw new CloudAccessError('unavailable');
  return target;
}

const entrySchema = z.object({ entry_url: z.url({ protocol: /^https$/ }) });

export function readCloudAmdEntry(data: unknown): string {
  const entry = entrySchema.safeParse(data);
  if (!entry.success) throw new CloudAccessError('unavailable');
  const { entry_url: href } = entry.data;
  const url = new URL(href);
  if (url.username || url.password || !url.hash) throw new CloudAccessError('unavailable');
  return href;
}

const gatewayCodeSchema = z.enum([
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

export async function readCloudAmdGatewayCode(response: Response) {
  const data = gatewayErrorSchema.safeParse(await response.json().catch(() => undefined));
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
