import * as Device from 'expo-device';
import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';
import * as z from 'zod';

import { defaultAppHeaders } from '@/backend/utils/defaultAppHeaders';
import { DataApiError, ErrorCode } from '@/shared/data/api/errors';
import type { DesktopPairingQr } from '@/shared/data/api/schemas/desktopConnections';

const REQUEST_TIMEOUT_MS = 4_000;

const PairResponseSchema = z.looseObject({
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

export async function requestWithTimeout<T>(
  url: string,
  init: RequestInit,
  read: (response: Response) => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await expoFetch(url, {
      ...init,
      redirect: 'error',
      signal: controller.signal,
    });
    const result = await read(response);
    controller.signal.throwIfAborted();
    return result;
  } catch (error) {
    // Preserve cancellation/timeouts even when a body parser reports a SyntaxError.
    controller.signal.throwIfAborted();
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
    controller.abort(); // Also release unread error-response bodies.
  }
}

export async function pairDesktop(baseUrls: string[], qr: DesktopPairingQr, signal: AbortSignal) {
  const reportedDeviceName = (Device.deviceName ?? Device.modelName ?? '').trim();
  const deviceName = (reportedDeviceName || 'Cherry Studio Mobile').slice(0, 64);
  for (const baseUrl of baseUrls) {
    try {
      return await requestWithTimeout(
        `${baseUrl}/pair`,
        {
          body: JSON.stringify({
            code: qr.code,
            device: { name: deviceName, platform: Platform.OS.slice(0, 32) },
          }),
          headers: { ...defaultAppHeaders(), 'Content-Type': 'application/json' },
          method: 'POST',
        },
        async (response) => {
          if (response.status === 403) {
            throw new PairingRejectedError();
          }
          if (!response.ok) {
            throw new Error(`Pairing request failed with status ${response.status}`);
          }

          const parsed = PairResponseSchema.safeParse(await response.json());
          if (!parsed.success) {
            throw desktopError(
              'invalid-pair-response',
              'Desktop returned an invalid pairing response',
            );
          }
          return { baseUrl, ...parsed.data };
        },
        signal,
      );
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof PairingRejectedError || error instanceof DataApiError) {
        throw error;
      }
    }
  }

  throw desktopError('unreachable', 'Could not connect to the desktop');
}

export async function fetchSnapshot(baseUrls: string[], token: string, signal: AbortSignal) {
  for (const baseUrl of baseUrls) {
    try {
      return await requestWithTimeout(
        `${baseUrl}/v1/export/providers`,
        {
          headers: { ...defaultAppHeaders(), Authorization: `Bearer ${token}` },
          method: 'GET',
        },
        async (response) => {
          if (response.status === 401 || response.status === 403) {
            throw new AuthorizationError(response.status);
          }
          if (!response.ok) {
            throw new Error(`Desktop configuration request failed with status ${response.status}`);
          }
          let payload: unknown;
          try {
            payload = await response.json();
          } catch {
            throw desktopError('invalid-snapshot', 'Desktop returned invalid configuration data');
          }
          return { baseUrl, payload };
        },
        signal,
      );
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof AuthorizationError || error instanceof DataApiError) {
        throw error;
      }
    }
  }

  throw desktopError('unreachable', 'Could not fetch configuration from the desktop');
}
