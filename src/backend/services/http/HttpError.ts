export type HttpErrorKind =
  | 'cancelled'
  | 'http'
  | 'internal'
  | 'invalid_response'
  | 'network'
  | 'timeout';

export type HttpErrorDetail =
  | boolean
  | number
  | string
  | null
  | Readonly<{ [key: string]: HttpErrorDetail }>
  | readonly HttpErrorDetail[];

export type HttpErrorDetails = Readonly<Record<string, HttpErrorDetail>>;

export interface HttpErrorOptions {
  code?: string;
  details?: HttpErrorDetails;
  kind: HttpErrorKind;
  requestId?: string;
  retryAfter?: string;
  status?: number;
}

export class HttpError extends Error {
  public readonly code?: string;
  public readonly details?: HttpErrorDetails;
  public readonly kind: HttpErrorKind;
  public readonly requestId?: string;
  public readonly retryAfter?: string;
  public readonly status?: number;

  public constructor(message: string, options: HttpErrorOptions) {
    super(message);
    this.name = 'HttpError';
    this.kind = options.kind;
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.retryAfter = options.retryAfter;
    this.details = options.details;
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}
