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
