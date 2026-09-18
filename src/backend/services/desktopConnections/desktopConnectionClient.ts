import * as Device from 'expo-device';
import { Platform } from 'react-native';
import * as z from 'zod';

import { createHttpClient, isHttpError } from '@/backend/services/http';
import { defaultAppHeaders } from '@/backend/utils/defaultAppHeaders';
import { DataApiError, ErrorCode } from '@/shared/data/api/errors';
import {
  DesktopRemoteAgentSchema,
  type DesktopPairingQr,
} from '@/shared/data/api/schemas/desktopConnections';

const PairResponseSchema = z.object({
  name: z.string().min(1),
  token: z.string().min(1),
  version: z.string(),
});
export class PairingRejectedError extends Error {}
export class AuthorizationError extends Error {
  constructor(readonly status: 401 | 403) {
    super(`Desktop authorization failed with status ${status}`);
  }
}
export function desktopError(reason: string, message: string): DataApiError {
  return new DataApiError(ErrorCode.INVALID_OPERATION, message, { reason });
}
export function baseUrlsFromQr(qr: DesktopPairingQr): string[] {
  return [...new Set(qr.ips.map((ip) => `http://${ip.includes(':') ? `[${ip}]` : ip}:${qr.port}`))];
}

/** Address selection belongs to this domain; shared HTTP never retries a request. */
async function requestDesktop(
  baseUrls: string[],
  path: string,
  signal: AbortSignal,
  token?: string,
  body?: unknown,
) {
  for (const baseUrl of baseUrls) {
    signal.throwIfAborted();
    const http = createHttpClient({
      baseUrl,
      timeoutMs: 4_000,
      headers: {
        ...defaultAppHeaders(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    try {
      const response = await http.request<unknown>({
        ...(body === undefined ? { method: 'GET' as const } : { method: 'POST' as const, body }),
        path,
        signal,
        redirect: 'error',
        maxResponseBytes: path === '/v1/export/providers' ? 16 * 1024 * 1024 : 16 * 1024,
      });
      signal.throwIfAborted();
      return { baseUrl, payload: response.data };
    } catch (error) {
      signal.throwIfAborted();
      if (isHttpError(error)) {
        if (path === '/pair' && error.status === 403) throw new PairingRejectedError();
        if (token && (error.status === 401 || error.status === 403))
          throw new AuthorizationError(error.status);
        if (path === '/v1/remote-agent' && (error.status === 503 || error.status === 404)) {
          throw desktopError('agent-unavailable', 'Remote Agent service is unavailable');
        }
      }
      // A pairing code is single-use on the PC; another address cannot issue a second token.
    }
  }
  throw desktopError('unreachable', 'Could not connect to the desktop');
}
export async function pairDesktop(baseUrls: string[], qr: DesktopPairingQr, signal: AbortSignal) {
  const reportedName = (Device.deviceName ?? Device.modelName ?? '').trim();
  const response = await requestDesktop(baseUrls, '/pair', signal, undefined, {
    code: qr.code,
    device: {
      name: (reportedName || 'Cherry Studio Mobile').slice(0, 64),
      platform: Platform.OS.slice(0, 32),
    },
  });
  const parsed = PairResponseSchema.safeParse(response.payload);
  if (!parsed.success)
    throw desktopError('invalid-pair-response', 'Desktop returned an invalid pairing response');
  return { baseUrl: response.baseUrl, ...parsed.data };
}
export function fetchSnapshot(baseUrls: string[], token: string, signal: AbortSignal) {
  return requestDesktop(baseUrls, '/v1/export/providers', signal, token);
}
export async function discoverRemoteAgent(baseUrls: string[], token: string, signal: AbortSignal) {
  const response = await requestDesktop(baseUrls, '/v1/remote-agent', signal, token);
  const parsed = DesktopRemoteAgentSchema.safeParse(response.payload);
  if (!parsed.success)
    throw desktopError('invalid-agent-response', 'Desktop returned invalid Agent connection data');
  return { baseUrl: response.baseUrl, descriptor: parsed.data };
}
