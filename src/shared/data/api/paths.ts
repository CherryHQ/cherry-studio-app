import type { ApiSchemas } from './schemas/apiSchemas';

export type ResolvedPath<T extends string> = T extends `${infer Prefix}/:${string}/${infer Suffix}`
  ? `${Prefix}/${string}/${ResolvedPath<Suffix>}`
  : T extends `${infer Prefix}/:${string}`
    ? `${Prefix}/${string}`
    : T;

export type ConcreteApiPaths = {
  [K in keyof ApiSchemas]: ResolvedPath<K & string>;
}[keyof ApiSchemas];

export type TemplateApiPaths = keyof ApiSchemas & string;
export type ApiPath = ConcreteApiPaths | TemplateApiPaths;

export type MatchApiPath<Path extends string> = {
  [K in keyof ApiSchemas]: Path extends ResolvedPath<K & string> ? K : never;
}[keyof ApiSchemas];

type SchemaKeyForPath<Path extends string> = Path extends TemplateApiPaths
  ? Path
  : MatchApiPath<Path>;

export type ParamsForPath<Path extends string, Method extends string> =
  SchemaKeyForPath<Path> extends keyof ApiSchemas
    ? ApiSchemas[SchemaKeyForPath<Path>] extends { [M in Method]: { params: infer P } }
      ? P
      : never
    : never;

export type QueryParamsForPath<
  Path extends string,
  Method extends 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT',
> =
  SchemaKeyForPath<Path> extends keyof ApiSchemas
    ? ApiSchemas[SchemaKeyForPath<Path>] extends { [M in Method]: { query?: infer Q } }
      ? Q
      : never
    : never;

export type BodyForPath<Path extends string, Method extends string> =
  SchemaKeyForPath<Path> extends keyof ApiSchemas
    ? ApiSchemas[SchemaKeyForPath<Path>] extends { [M in Method]: { body: infer B } }
      ? B
      : never
    : never;

export type ResponseForPath<Path extends string, Method extends string> =
  SchemaKeyForPath<Path> extends keyof ApiSchemas
    ? ApiSchemas[SchemaKeyForPath<Path>] extends { [M in Method]: { response: infer R } }
      ? R
      : never
    : never;
