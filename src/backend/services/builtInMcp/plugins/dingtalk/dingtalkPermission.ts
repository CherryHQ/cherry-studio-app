import * as z from 'zod';

import { PluginError } from '@/shared/contracts/plugins';

import { dingtalkVerificationUrl, type DingtalkChallenge } from './dingtalkOauth';

const codes = [
  'PAT_NO_PERMISSION',
  'PAT_LOW_RISK_NO_PERMISSION',
  'PAT_MEDIUM_RISK_NO_PERMISSION',
  'PAT_HIGH_RISK_NO_PERMISSION',
  'PAT_ORG_POLICY_DENIED',
  'PAT_BATCH_AUTH_PENDING',
  'PAT_SCOPE_AUTH_REQUIRED',
  'AGENT_CODE_NOT_EXISTS',
  'DWS_SERVICE_UNAUTHORIZED',
  'DWS_AUTH_SERVICE_FAILED',
] as const;
export const DingtalkPermissionSchema = z.object({
  code: z.enum(codes),
  uri: z.string().max(8192).optional(),
  flowId: z.string().min(1).max(256).regex(/^\S+$/).optional(),
  clientId: z.string().min(1).max(256).regex(/^\S+$/).optional(),
  clientSecret: z
    .string()
    .min(1)
    .max(16_384)
    .regex(/^[^\r\n\0]+$/)
    .optional(),
  missingScope: z
    .string()
    .min(1)
    .max(4096)
    .regex(/^[a-zA-Z0-9_.:-]+(?: [a-zA-Z0-9_.:-]+)*$/)
    .optional(),
  pollIntervalSeconds: z.number().int().positive().optional(),
});
export type DingtalkPermission = z.infer<typeof DingtalkPermissionSchema>;
const object = z.record(z.string(), z.unknown());

/** Strip authorization responses before they reach model output, including HTTP-200 tool errors. */
export function readDingtalkPermission(value: unknown, depth = 0): DingtalkPermission | undefined {
  if (depth > 6) return;
  if (typeof value === 'string') {
    if (value.length > 65_536 || !value.trim().startsWith('{')) return;
    try {
      return readDingtalkPermission(JSON.parse(value), depth + 1);
    } catch (error) {
      if (error instanceof PluginError) throw error;
      return;
    }
  }
  const parsed = object.safeParse(value);
  if (!parsed.success) return;
  const body = parsed.data;
  const code = [body.code, body.errorCode, body.error_code].find(
    (candidate) => typeof candidate === 'string' && codes.some((known) => known === candidate),
  );
  if (code) {
    const data = object.safeParse(body.data);
    const fields = data.success ? data.data : {};
    const permission = DingtalkPermissionSchema.safeParse({
      code,
      uri: fields.uri || fields.authUrl || fields.authorizationUrl,
      flowId: fields.flowId,
      clientId: fields.clientId,
      clientSecret: fields.clientSecret,
      missingScope: fields.missingScope,
      pollIntervalSeconds: fields.pollIntervalSeconds,
    });
    if (!permission.success)
      throw new PluginError(
        'access',
        'Dingtalk requires authorization. Open the plugin connection to continue.',
      );
    return permission.data;
  }
  for (const key of ['structuredContent', 'toolResult', 'result', 'data', 'error']) {
    const permission = readDingtalkPermission(body[key], depth + 1);
    if (permission) return permission;
  }
  if (Array.isArray(body.content)) {
    for (const block of body.content.slice(0, 100)) {
      const item = object.safeParse(block);
      if (item.success && item.data.type === 'text') {
        const permission = readDingtalkPermission(item.data.text, depth + 1);
        if (permission) return permission;
      }
    }
  }
}

/** Inspect small JSON error envelopes without consuming the SDK's stream or buffering documents. */
export async function readDingtalkResponsePermission(response: Response, signal?: AbortSignal) {
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) return;
  if (Number(response.headers.get('content-length')) > 65_536) return;
  const reader = response.clone().body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 65_536) return;
      text += decoder.decode(chunk.value, { stream: true });
    }
    return readDingtalkPermission(text + decoder.decode());
  } finally {
    signal?.removeEventListener('abort', abort);
    // A tee branch's cancellation waits for the SDK's branch; do not await it here.
    void reader.cancel().catch(() => {});
  }
}

export function dingtalkPermissionChallenge(permission: DingtalkPermission): DingtalkChallenge {
  if (!permission.uri)
    throw new PluginError('access', 'Dingtalk did not provide an authorization link.');
  const verificationUrl = dingtalkVerificationUrl(permission.uri);
  const url = new URL(verificationUrl);
  const route = decodeURIComponent(url.hash.slice(1));
  const query = route.startsWith('/personalAuthorization?')
    ? new URLSearchParams(route.slice('/personalAuthorization?'.length))
    : url.searchParams;
  const flowId = permission.flowId || query.get('flowId');
  if (!flowId || (query.has('flowId') && query.get('flowId') !== flowId))
    throw new PluginError('request', 'Invalid Dingtalk authorization flow.');
  const intervalMs = Math.min(60, Math.max(5, permission.pollIntervalSeconds ?? 5)) * 1000;
  return {
    verificationUrl,
    flowId,
    userCode: query.get('userCode') || undefined,
    expiresAt: Date.now() + 10 * 60_000,
    intervalMs,
    nextPollAt: Date.now() + intervalMs,
  };
}
