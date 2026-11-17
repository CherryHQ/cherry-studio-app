import * as z from 'zod';

import { createHttpClient, isHttpError } from '@/backend/services/http';

import type { RuntimeTool, RuntimeToolResult } from '../runtime';
import { toRuntimeInputSchema, toolValidationError } from './runtimeToolSchema';

const inputSchema = z
  .strictObject({
    url: z
      .url()
      .regex(/^https?:\/\//i)
      .describe('Full HTTP(S) URL, including any query parameters.'),
    method: z
      .enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
      .optional()
      .describe('HTTP method. Defaults to GET.'),
    headers: z.record(z.string(), z.string()).optional().describe('Optional request headers.'),
    body: z
      .string()
      .optional()
      .describe(
        'Raw request body. Serialize JSON to a string and set Content-Type. Omit for GET/HEAD.',
      ),
  })
  .refine(
    ({ method = 'GET', body }) => body === undefined || (method !== 'GET' && method !== 'HEAD'),
    { message: 'GET and HEAD requests must not include a body.', path: ['body'] },
  );

export function createHttpRequestTool(createClient = createHttpClient): RuntimeTool {
  return {
    ref: { source: 'builtin', capabilityId: 'http_request' },
    providerName: 'http_request',
    displayName: 'HTTP request',
    description:
      'Send a plain HTTP(S) request from this device and return its status, headers and raw text body. Use for API calls; web_fetch is for readable web pages. Put query parameters in the URL. The body is a string sent as provided; set Content-Type for JSON or form data. Returns all HTTP statuses, including 4xx/5xx and unfollowed redirects. Times out after 30 seconds and reads at most 64 KiB of response bytes as UTF-8 text, with a truncated flag. Requests are never automatically retried. A timeout or network failure does not prove the server did nothing; check the resulting state before considering another write.',
    inputSchema: toRuntimeInputSchema(inputSchema),
    approval: 'ask',
    deferred: true,
    async execute({ input, signal }): Promise<RuntimeToolResult> {
      signal.throwIfAborted();
      const parsed = inputSchema.safeParse(input);
      if (!parsed.success)
        return failure('invalid_tool_input', toolValidationError(parsed.error), true);
      const { method = 'GET', headers, body } = parsed.data;
      const url = new URL(parsed.data.url);
      const client = createClient({ baseUrl: url.origin, statusPolicy: 'all' });
      const request = {
        path: `${url.pathname}${url.search}`,
        logPath: url.pathname,
        headers:
          body === undefined ? headers : { 'Content-Type': 'text/plain;charset=UTF-8', ...headers },
        credentials: 'omit' as const,
        redirect: 'manual' as const,
        responseType: 'text' as const,
        maxResponseBytes: 64 * 1024,
        truncateResponse: true,
        timeoutMs: 30_000,
        signal,
      };
      try {
        const response = await client.request<string>(
          method === 'GET' || method === 'HEAD'
            ? { ...request, method }
            : { ...request, method, body },
        );
        signal.throwIfAborted();
        return {
          value: {
            status: response.status,
            headers: response.headers,
            body: response.data,
            truncated: response.truncated ?? false,
          },
          artifacts: [],
        };
      } catch (error) {
        signal.throwIfAborted();
        if (!isHttpError(error)) throw error;
        return failure(
          error.code ?? 'http_request_failed',
          error.kind === 'timeout' || error.kind === 'network'
            ? `${error.message} The server-side outcome is unknown. Do not automatically repeat the request; check the resulting state before considering another write.`
            : error.message,
        );
      }
    },
  };
}

function failure(code: string, message: string, retryable = false): RuntimeToolResult {
  return {
    value: { status: 'error', code, message, retryable },
    artifacts: [],
    failure: { scope: 'call', error: { code, message, retryable, origin: 'tool' } },
  };
}
