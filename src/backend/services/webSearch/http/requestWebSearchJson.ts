import * as z from 'zod';

import {
  createHttpClient,
  type HttpErrorDecoder,
  type HttpHeaders,
  type HttpQuery,
} from '@/backend/services/http';
import { defaultAppHeaders } from '@/backend/utils/defaultAppHeaders';

const MAX_ERROR_FIELD_LENGTH = 500;
const MAX_ERROR_CODE_LENGTH = 128;

const WebSearchErrorSchema = z.looseObject({
  code: z.union([z.number(), z.string()]).optional(),
  error: z.union([z.string(), z.looseObject({ message: z.string().optional() })]).optional(),
  error_code: z.union([z.number(), z.string()]).optional(),
  error_msg: z.string().optional(),
  message: z.string().optional(),
  msg: z.string().nullable().optional(),
});

export type WebSearchJsonRequest<TResponse, TBody = unknown> = {
  readonly body?: TBody;
  readonly headers?: HttpHeaders;
  readonly method: 'GET' | 'POST';
  readonly operation: string;
  readonly providerId: string;
  readonly responseSchema: z.ZodType<TResponse>;
  readonly signal?: AbortSignal;
  readonly url: string;
};

export type WebSearchJsonRequester = <TResponse, TBody = unknown>(
  request: WebSearchJsonRequest<TResponse, TBody>,
) => Promise<TResponse>;

function toHttpQuery(searchParams: URLSearchParams): HttpQuery | undefined {
  const query: Record<string, string | string[]> = {};

  for (const [name, value] of searchParams) {
    const current = query[name];
    if (current === undefined) {
      query[name] = value;
    } else if (Array.isArray(current)) {
      current.push(value);
    } else {
      query[name] = [current, value];
    }
  }

  return Object.keys(query).length > 0 ? query : undefined;
}

function readSafeErrorMessage(data: unknown): string | undefined {
  const parsed = WebSearchErrorSchema.safeParse(data);
  if (!parsed.success) {
    return undefined;
  }

  const error = parsed.data.error;
  const message =
    parsed.data.message ??
    parsed.data.error_msg ??
    parsed.data.msg ??
    (typeof error === 'string' ? error : error?.message);
  const normalized = message?.trim();

  return normalized && normalized.length <= MAX_ERROR_FIELD_LENGTH ? normalized : undefined;
}

function createErrorDecoder(providerId: string, operation: string): HttpErrorDecoder {
  return ({ data }) => {
    const parsed = WebSearchErrorSchema.safeParse(data);
    if (!parsed.success) {
      return undefined;
    }

    const rawCode = parsed.data.code ?? parsed.data.error_code;
    const normalizedCode = rawCode === undefined ? undefined : String(rawCode).trim();
    const code =
      normalizedCode && normalizedCode.length <= MAX_ERROR_CODE_LENGTH ? normalizedCode : undefined;
    const upstreamMessage = readSafeErrorMessage(parsed.data);

    return {
      code,
      details: { operation, providerId },
      message: upstreamMessage
        ? `${providerId} ${operation} failed: ${upstreamMessage}`
        : `${providerId} ${operation} failed.`,
    };
  };
}

export const requestWebSearchJson: WebSearchJsonRequester = async <TResponse, TBody = unknown>(
  request: WebSearchJsonRequest<TResponse, TBody>,
): Promise<TResponse> => {
  const target = new URL(request.url);
  const client = createHttpClient({
    baseUrl: target.origin,
    headers: defaultAppHeaders(),
  });
  const commonRequest = {
    errorDecoder: createErrorDecoder(request.providerId, request.operation),
    headers: request.headers,
    path: target.pathname || '/',
    query: toHttpQuery(target.searchParams),
    signal: request.signal,
  } as const;

  const response =
    request.method === 'GET'
      ? await client.request<unknown>({ ...commonRequest, method: 'GET' })
      : await client.request<unknown, TBody>({
          ...commonRequest,
          body: request.body,
          method: 'POST',
        });

  if (typeof response.data === 'string') {
    throw new Error(`${request.providerId} ${request.operation} returned invalid JSON`);
  }

  const parsed = request.responseSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new Error(`${request.providerId} ${request.operation} response validation failed`, {
      cause: parsed.error,
    });
  }

  return parsed.data;
};
