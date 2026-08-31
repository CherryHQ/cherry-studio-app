import { AxiosError, AxiosHeaders, isAxiosError, isCancel, type AxiosResponse } from 'axios';

import { HttpError, isHttpError, type HttpErrorDetails } from './HttpError';

const MAX_PUBLIC_HEADER_LENGTH = 256;

export interface AxiosErrorResponse {
  readonly data: unknown;
  readonly headers: AxiosResponse<unknown>['headers'];
  readonly status: number;
}

export interface DecodedHttpError {
  readonly code?: string;
  readonly details?: HttpErrorDetails;
  readonly message: string;
  readonly requestId?: string;
  readonly retryAfter?: string;
}

export type AxiosErrorDecoder = (response: AxiosErrorResponse) => DecodedHttpError | undefined;

function readPublicHeader(
  headers: AxiosResponse<unknown>['headers'],
  name: string,
): string | undefined {
  const value = AxiosHeaders.from(headers).get(name);
  const firstValue = Array.isArray(value) ? value[0] : value;

  if (typeof firstValue !== 'string' && typeof firstValue !== 'number') {
    return undefined;
  }

  const normalized = String(firstValue).trim();
  if (!normalized || normalized.length > MAX_PUBLIC_HEADER_LENGTH) {
    return undefined;
  }
  return normalized;
}

function mapResponseError(error: AxiosError, decode?: AxiosErrorDecoder): HttpError {
  const response = error.response;
  if (!response) {
    return new HttpError('HTTP response could not be read.', {
      code: 'INVALID_HTTP_RESPONSE',
      kind: 'invalid_response',
    });
  }

  const responseView: AxiosErrorResponse = {
    data: response.data,
    headers: response.headers,
    status: response.status,
  };
  let decoded: DecodedHttpError | undefined;

  try {
    decoded = decode?.(responseView);
  } catch {
    // A malformed or unexpected error body falls back to safe transport metadata.
  }

  return new HttpError(decoded?.message ?? `HTTP request failed with status ${response.status}.`, {
    code: decoded?.code,
    details: decoded?.details,
    kind: 'http',
    requestId:
      decoded?.requestId ??
      readPublicHeader(response.headers, 'x-request-id') ??
      readPublicHeader(response.headers, 'request-id'),
    retryAfter: decoded?.retryAfter ?? readPublicHeader(response.headers, 'retry-after'),
    status: response.status,
  });
}

/**
 * Maps an Axios rejection at a domain boundary without retaining the original
 * error, request config, credentials, or unvalidated response body.
 */
export function mapAxiosError(error: unknown, decode?: AxiosErrorDecoder): HttpError {
  if (isHttpError(error)) {
    return error;
  }

  if (!isAxiosError(error)) {
    return new HttpError('HTTP request failed unexpectedly.', {
      code: 'HTTP_INTERNAL_ERROR',
      kind: 'internal',
    });
  }

  if (isCancel(error) || error.code === AxiosError.ERR_CANCELED) {
    return new HttpError('HTTP request was cancelled.', {
      code: 'REQUEST_CANCELLED',
      kind: 'cancelled',
    });
  }

  if (error.code === AxiosError.ECONNABORTED || error.code === AxiosError.ETIMEDOUT) {
    return new HttpError('HTTP request timed out.', {
      code: 'REQUEST_TIMEOUT',
      kind: 'timeout',
    });
  }

  if (error.response) {
    return mapResponseError(error, decode);
  }

  if (error.code === AxiosError.ERR_BAD_RESPONSE) {
    return new HttpError('HTTP response could not be read.', {
      code: 'INVALID_HTTP_RESPONSE',
      kind: 'invalid_response',
    });
  }

  return new HttpError('HTTP request could not reach the server.', {
    code: 'NETWORK_ERROR',
    kind: 'network',
  });
}
