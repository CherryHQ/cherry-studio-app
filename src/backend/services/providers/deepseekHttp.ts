import { File } from 'expo-file-system';
import * as z from 'zod';

import { createHttpClient } from '@/backend/services/http';

import { DeepseekServiceError, type DeepseekConnection } from './deepseekConnection';

export function deepseekUpload(file: File, purpose?: string, expiresAfter?: number): FormData {
  const form = new FormData();
  // DeepSeek rejects document forms whose purpose follows the file field.
  if (purpose) form.append('purpose', purpose);
  if (expiresAfter !== undefined) {
    form.append('expires_after[anchor]', 'created_at');
    form.append('expires_after[seconds]', String(expiresAfter));
  }
  form.append('file', file, file.name);
  return form;
}

/** Finite JSON services use the existing bounded, cancellable HTTP transport without retries. */
export async function requestDeepseekJson<T>(
  connection: DeepseekConnection,
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
  signal: AbortSignal,
  timeoutMs = 180_000,
): Promise<T> {
  const api = createHttpClient({ baseUrl: connection.baseUrl, timeoutMs });
  const response = await api.request<string>({
    method: 'POST',
    path,
    body,
    headers: connection.headers,
    signal,
    redirect: 'error',
    responseType: 'text',
    maxResponseBytes: 16 * 1024 * 1024,
  });
  signal.throwIfAborted();
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.data);
  } catch {
    throw new DeepseekServiceError('invalid-response');
  }
  // OCR may report a failure after HTTP 200 and leading keep-alive whitespace.
  if (parsed && typeof parsed === 'object' && 'error' in parsed)
    throw new DeepseekServiceError('failed');
  const result = schema.safeParse(parsed);
  if (!result.success) throw new DeepseekServiceError('invalid-response');
  return result.data;
}
