import type { BodyForPath, ConcreteApiPaths, QueryParamsForPath, ResponseForPath } from './paths';
import type { ApiSchemas } from './schemas/apiSchemas';

export type HttpMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';

/**
 * Offset-based pagination parameters.
 */
export interface OffsetPaginationParams {
  /** Page number (1-based). */
  page?: number;
  /** Items per page. */
  limit?: number;
}

/**
 * Cursor-based pagination parameters.
 */
export interface CursorPaginationParams {
  /** Cursor for pagination boundary. */
  cursor?: string;
  /** Items per page. */
  limit?: number;
}

export interface SortParams {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface SearchParams {
  search?: string;
}

/**
 * Offset-based pagination response.
 */
export interface OffsetPaginationResponse<T> {
  /** Items for current page */
  items: T[];
  /** Current page number (1-based) */
  page: number;
  /** Total number of items */
  total: number;
}

/**
 * Cursor-based pagination response.
 *
 * Matches Cherry desktop's shared Data API pagination shape.
 */
export interface CursorPaginationResponse<T> {
  /** Items for current page */
  items: T[];
  /** Next cursor (undefined means no more data) */
  nextCursor?: string;
}

export type PaginationResponse<T> = CursorPaginationResponse<T> | OffsetPaginationResponse<T>;

export type InferPaginationMode<R> =
  R extends OffsetPaginationResponse<unknown>
    ? 'offset'
    : R extends CursorPaginationResponse<unknown>
      ? 'cursor'
      : never;

export type InferPaginationItem<R> =
  R extends OffsetPaginationResponse<infer T>
    ? T
    : R extends CursorPaginationResponse<infer T>
      ? T
      : never;

export interface ApiClient {
  delete<TPath extends ConcreteApiPaths>(
    path: TPath,
    options?: { query?: QueryParamsForPath<TPath, 'DELETE'> },
  ): Promise<ResponseForPath<TPath, 'DELETE'>>;
  get<TPath extends ConcreteApiPaths>(
    path: TPath,
    options?: { query?: QueryParamsForPath<TPath, 'GET'> },
  ): Promise<ResponseForPath<TPath, 'GET'>>;
  patch<TPath extends ConcreteApiPaths>(
    path: TPath,
    options: {
      body?: BodyForPath<TPath, 'PATCH'>;
      query?: QueryParamsForPath<TPath, 'PATCH'>;
    },
  ): Promise<ResponseForPath<TPath, 'PATCH'>>;
  post<TPath extends ConcreteApiPaths>(
    path: TPath,
    options: {
      body?: BodyForPath<TPath, 'POST'>;
      query?: QueryParamsForPath<TPath, 'POST'>;
    },
  ): Promise<ResponseForPath<TPath, 'POST'>>;
  put<TPath extends ConcreteApiPaths>(
    path: TPath,
    options: {
      body: BodyForPath<TPath, 'PUT'>;
      query?: QueryParamsForPath<TPath, 'PUT'>;
    },
  ): Promise<ResponseForPath<TPath, 'PUT'>>;
}

export type ApiPaths = keyof ApiSchemas & string;
export type ApiMethods<Path extends ApiPaths> = keyof ApiSchemas[Path] & HttpMethod;

type MethodShape<Path extends ApiPaths, Method extends ApiMethods<Path>> = ApiSchemas[Path][Method];
type Field<Shape, Key extends PropertyKey> = Key extends keyof Shape ? Shape[Key] : never;
type RequiredField<Shape, Key extends PropertyKey> =
  Shape extends Record<Key, unknown> ? true : false;

export type ApiHandler<Path extends ApiPaths, Method extends ApiMethods<Path>> = (
  input: (RequiredField<MethodShape<Path, Method>, 'params'> extends true
    ? { params: Field<MethodShape<Path, Method>, 'params'> }
    : { params?: Field<MethodShape<Path, Method>, 'params'> }) &
    (RequiredField<MethodShape<Path, Method>, 'query'> extends true
      ? { query: Field<MethodShape<Path, Method>, 'query'> }
      : { query?: Field<MethodShape<Path, Method>, 'query'> }) &
    (RequiredField<MethodShape<Path, Method>, 'body'> extends true
      ? { body: Field<MethodShape<Path, Method>, 'body'> }
      : { body?: Field<MethodShape<Path, Method>, 'body'> }),
) => Promise<
  Field<MethodShape<Path, Method>, 'response'> extends undefined
    ? void
    : Field<MethodShape<Path, Method>, 'response'>
>;

export type ApiImplementation = {
  [Path in ApiPaths]: {
    [Method in ApiMethods<Path>]: ApiHandler<Path, Method>;
  };
};

export type HandlersFor<Schemas> = Pick<
  ApiImplementation,
  Extract<keyof Schemas, keyof ApiImplementation>
>;

export interface ServiceOptions {
  /** Database transaction to use. */
  transaction?: unknown;
  /** User context for authorization. */
  user?: unknown;
  /** Additional service-specific options. */
  metadata?: Record<string, unknown>;
}

export enum ErrorCode {
  BAD_REQUEST = 'BAD_REQUEST',
  CONFLICT = 'CONFLICT',
  DATABASE_ERROR = 'DATABASE_ERROR',
  DATA_INCONSISTENT = 'DATA_INCONSISTENT',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  INVALID_OPERATION = 'INVALID_OPERATION',
  METHOD_NOT_ALLOWED = 'METHOD_NOT_ALLOWED',
  MIGRATION_ERROR = 'MIGRATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  RESOURCE_LOCKED = 'RESOURCE_LOCKED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  TIMEOUT = 'TIMEOUT',
  UNAUTHORIZED = 'UNAUTHORIZED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}

const errorStatusMap: Record<ErrorCode, number> = {
  [ErrorCode.BAD_REQUEST]: 400,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.DATABASE_ERROR]: 500,
  [ErrorCode.DATA_INCONSISTENT]: 409,
  [ErrorCode.INTERNAL_SERVER_ERROR]: 500,
  [ErrorCode.INVALID_OPERATION]: 400,
  [ErrorCode.METHOD_NOT_ALLOWED]: 405,
  [ErrorCode.MIGRATION_ERROR]: 500,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.PERMISSION_DENIED]: 403,
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,
  [ErrorCode.RESOURCE_LOCKED]: 423,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.TIMEOUT]: 504,
  [ErrorCode.UNAUTHORIZED]: 401,
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

// oxlint-disable-next-line typescript/no-extraneous-class -- Mirrors Cherry shared DataApiErrorFactory API.
export class DataApiErrorFactory {
  static conflict(message: string, resource?: string): DataApiError {
    return new DataApiError(ErrorCode.CONFLICT, message, { description: message, resource });
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
