import { loggerService } from '@logger';
import * as Device from 'expo-device';
import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';
import * as z from 'zod';

import { defaultAppHeaders } from '@/backend/utils/defaultAppHeaders';
import { DataApiError, ErrorCode } from '@/shared/data/api/errors';
import type { DesktopPairingQr } from '@/shared/data/api/schemas/desktopConnections';

const REQUEST_TIMEOUT_MS = 4_000;

const logger = loggerService.withContext('DesktopConnection');

const PairResponseSchema = z.looseObject({
  name: z.string().min(1),
  token: z.string().min(1),
  version: z.string(),
});

export class PairingRejectedError extends Error {}
class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export class AuthorizationError extends Error {
  constructor(readonly status: 401 | 403) {
    super(`Desktop authorization failed with status ${status}`);
  }
}

export function desktopError(reason: string, message: string): DataApiError {
  return new DataApiError(ErrorCode.INVALID_OPERATION, message, { reason });
}

/** Keeps the shape free of addresses and tokens so a failed attempt is safe to report. */
function attemptOutcome(error: unknown): string {
  if (error instanceof HttpStatusError) return `http-${error.status}`;
  if (!(error instanceof Error)) return 'unknown';
  return error.name === 'AbortError' ? 'timeout' : error.name;
}

/** Every address failed and its cause was dropped; name the causes before collapsing them. */
function unreachable(operation: string, message: string, attempts: string[]): DataApiError {
  const error = desktopError('unreachable', message);
  // A desktop that answers with an HTTP error is a defect worth reporting; a silent network is not.
  const level = attempts.some((attempt) => attempt.startsWith('http-')) ? 'error' : 'warn';
  logger[level](message, error, { attempts, operation });
  return error;
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
  const attempts: string[] = [];
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
            throw new HttpStatusError(
              response.status,
              `Pairing request failed with status ${response.status}`,
            );
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
      attempts.push(attemptOutcome(error));
    }
  }

  throw unreachable('desktop.pair', 'Could not connect to the desktop', attempts);
}

export async function fetchSnapshot(baseUrls: string[], token: string, signal: AbortSignal) {
  const attempts: string[] = [];
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
            throw new HttpStatusError(
              response.status,
              `Desktop configuration request failed with status ${response.status}`,
            );
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
      attempts.push(attemptOutcome(error));
    }
  }

  throw unreachable(
    'desktop.snapshot.fetch',
    'Could not fetch configuration from the desktop',
    attempts,
  );
}
