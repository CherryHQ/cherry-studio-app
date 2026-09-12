import { loggerService } from '@logger';
import { AxiosError, isAxiosError, isCancel } from 'axios';

import type { DecodedHttpError, HttpErrorDecoder, HttpErrorResponse } from './HttpClient';
import { HttpError, isHttpError } from './HttpError';
import { toHttpHeaders } from './toHttpHeaders';

const logger = loggerService.withContext('HttpTransport');

const MAX_PUBLIC_HEADER_LENGTH = 256;

/**
 * Logs the real transport failure for diagnosis. Request and response headers,
 * bodies, and query values stay out of the log; the public `HttpError` stays
 * stable and desensitized.
 */
function logTransportFailure(error: AxiosError): void {
  logger.warn('HTTP request failed.', {
    code: error.code,
    message: error.message,
    method: error.config?.method,
    status: error.response?.status,
    url: `${error.config?.baseURL ?? ''}${error.config?.url ?? ''}`,
  });
}

function readPublicHeader(headers: HttpErrorResponse['headers'], name: string): string | undefined {
  const normalized = headers[name.toLowerCase()]?.trim();
  if (!normalized || normalized.length > MAX_PUBLIC_HEADER_LENGTH) {
    return undefined;
  }
  return normalized;
}

function mapResponseError(error: AxiosError, decode?: HttpErrorDecoder): HttpError {
  const response = error.response;
  if (!response) {
    return new HttpError('HTTP response could not be read.', {
      code: 'INVALID_HTTP_RESPONSE',
      kind: 'invalid_response',
    });
  }

  const headers = toHttpHeaders(response.headers);
  const responseView: HttpErrorResponse = {
    data: response.data,
    headers,
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
      readPublicHeader(headers, 'x-request-id') ??
      readPublicHeader(headers, 'request-id'),
    retryAfter: decoded?.retryAfter ?? readPublicHeader(headers, 'retry-after'),
    status: response.status,
  });
}

/**
 * Maps an Axios rejection inside the transport without retaining the original
 * error, request config, credentials, or unvalidated response body.
 */
export function mapAxiosError(error: unknown, decode?: HttpErrorDecoder): HttpError {
  if (isHttpError(error)) {
    return error;
  }

  if (!isAxiosError(error)) {
    logger.error(
      'HTTP transport failed unexpectedly.',
      error instanceof Error ? error : { value: String(error) },
    );
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

  logTransportFailure(error);

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
    if (error.message.startsWith('maxContentLength size of ')) {
      return new HttpError('HTTP response exceeded the allowed size.', {
        code: 'RESPONSE_TOO_LARGE',
        kind: 'invalid_response',
      });
    }

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
