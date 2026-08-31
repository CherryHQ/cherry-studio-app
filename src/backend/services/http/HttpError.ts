export type HttpErrorKind =
  | 'cancelled'
  | 'http'
  | 'internal'
  | 'invalid_response'
  | 'network'
  | 'timeout';

interface HttpErrorOptions {
  code?: string;
  kind: HttpErrorKind;
  status?: number;
}

export class HttpError extends Error {
  public readonly code?: string;
  public readonly kind: HttpErrorKind;
  public readonly status?: number;

  public constructor(message: string, options: HttpErrorOptions) {
    super(message);
    this.name = 'HttpError';
    this.kind = options.kind;
    this.status = options.status;
    this.code = options.code;
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}
