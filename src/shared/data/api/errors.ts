/**
 * The single error contract for the mobile Data API.
 *
 * The Data API is in-process: handlers throw `DataApiError` and callers catch
 * the same instance, so there is no serialized form and no request envelope.
 * Exactly one class exists — every layer must import it from here, or
 * `instanceof` narrowing fails across import paths.
 */

/**
 * Error codes the mobile Data API actually raises.
 * `status` on `DataApiError` carries the matching HTTP status code.
 */
export enum ErrorCode {
  /** 400 - Malformed request or invalid parameters */
  BAD_REQUEST = 'BAD_REQUEST',
  /** 409 - Duplicate or conflicting resource state */
  CONFLICT = 'CONFLICT',
  /** 500 - Unexpected failure inside a handler or service */
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  /** 400 - Operation violates business rules in the current state */
  INVALID_OPERATION = 'INVALID_OPERATION',
  /** 405 - Route exists but not for this HTTP method */
  METHOD_NOT_ALLOWED = 'METHOD_NOT_ALLOWED',
  /** 404 - Requested resource does not exist */
  NOT_FOUND = 'NOT_FOUND',
  /** 422 - Request data fails validation */
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}

const errorStatusMap: Record<ErrorCode, number> = {
  [ErrorCode.BAD_REQUEST]: 400,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.INTERNAL_SERVER_ERROR]: 500,
  [ErrorCode.INVALID_OPERATION]: 400,
  [ErrorCode.METHOD_NOT_ALLOWED]: 405,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.VALIDATION_ERROR]: 422,
};

export class DataApiError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;
  readonly status: number;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'DataApiError';
    this.code = code;
    this.status = errorStatusMap[code];
    this.details = details;
  }
}

// oxlint-disable-next-line typescript/no-extraneous-class -- Namespaced constructors; instances are plain DataApiError.
export class DataApiErrorFactory {
  /** Rewrap an existing code with a new message, e.g. to prefix caller context. */
  static create(code: ErrorCode, message: string, details?: Record<string, unknown>): DataApiError {
    return new DataApiError(code, message, details);
  }

  static conflict(message: string, resource?: string): DataApiError {
    return new DataApiError(ErrorCode.CONFLICT, message, { description: message, resource });
  }

  static internal(originalError: Error, context?: string): DataApiError {
    const message = context
      ? `Internal error in ${context}: ${originalError.message}`
      : `Internal error: ${originalError.message}`;
    return new DataApiError(ErrorCode.INTERNAL_SERVER_ERROR, message, {
      context,
      originalError: originalError.message,
    });
  }

  static invalidOperation(operation: string, reason?: string): DataApiError {
    const message = reason
      ? `Invalid operation: ${operation} - ${reason}`
      : `Invalid operation: ${operation}`;
    return new DataApiError(ErrorCode.INVALID_OPERATION, message, { operation, reason });
  }

  static notFound(resource: string, id?: string): DataApiError {
    const message = id ? `${resource} with id '${id}' not found` : `${resource} not found`;
    return new DataApiError(ErrorCode.NOT_FOUND, message, { id, resource });
  }

  static validation(fieldErrors: Record<string, string[]>, message?: string): DataApiError {
    return new DataApiError(ErrorCode.VALIDATION_ERROR, message ?? 'Request validation failed', {
      fieldErrors,
    });
  }
}

export function isDataApiError(error: unknown): error is DataApiError {
  return error instanceof DataApiError;
}

/**
 * Normalize any thrown value to a `DataApiError`.
 * Zod issues become a 422 with per-field messages; everything else becomes a 500.
 */
export function toDataApiError(error: unknown, context?: string): DataApiError {
  if (isDataApiError(error)) {
    return error;
  }

  if (isZodError(error)) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const path = issue.path.length > 0 ? issue.path.join('.') : '_root';
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path].push(issue.message);
    }
    return DataApiErrorFactory.validation(
      fieldErrors,
      `Validation failed${context ? ` in ${context}` : ''}`,
    );
  }

  if (error instanceof Error) {
    return DataApiErrorFactory.internal(error, context);
  }

  return DataApiErrorFactory.create(
    ErrorCode.INTERNAL_SERVER_ERROR,
    `Unknown error${context ? ` in ${context}` : ''}: ${String(error)}`,
    { context, originalError: String(error) },
  );
}

/**
 * Duck-type check for ZodError without importing zod as a dependency.
 * ZodError has a `.issues` array and `.name === 'ZodError'`.
 */
function isZodError(
  error: unknown,
): error is { issues: Array<{ path: (string | number)[]; message: string }> } {
  return (
    error instanceof Error &&
    error.name === 'ZodError' &&
    Array.isArray((error as unknown as Record<string, unknown>).issues)
  );
}
