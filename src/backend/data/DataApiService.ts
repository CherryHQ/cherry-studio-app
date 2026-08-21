import { DataApiError, ErrorCode } from '@/shared/data/api/errors';
import type {
  BodyForPath,
  ConcreteApiPaths,
  QueryParamsForPath,
  ResponseForPath,
} from '@/shared/data/api/paths';
import type { ApiClient, ApiImplementation, HttpMethod } from '@/shared/data/api/types';

type RouteHandler = (input: {
  body?: unknown;
  params: Record<string, string>;
  query?: unknown;
}) => Promise<unknown>;

type CompiledRoute = {
  handlers: Partial<Record<HttpMethod, RouteHandler>>;
  segments: string[];
  template: string;
};

export class DataApiService implements ApiClient {
  private readonly routes: CompiledRoute[];

  constructor(handlers: ApiImplementation) {
    this.routes = compileRoutes(handlers);
  }

  delete<TPath extends ConcreteApiPaths>(
    path: TPath,
    options?: { query?: QueryParamsForPath<TPath, 'DELETE'> },
  ): Promise<ResponseForPath<TPath, 'DELETE'>> {
    return this.request('DELETE', path, { query: options?.query }) as Promise<
      ResponseForPath<TPath, 'DELETE'>
    >;
  }

  get<TPath extends ConcreteApiPaths>(
    path: TPath,
    options?: { query?: QueryParamsForPath<TPath, 'GET'> },
  ): Promise<ResponseForPath<TPath, 'GET'>> {
    return this.request('GET', path, { query: options?.query }) as Promise<
      ResponseForPath<TPath, 'GET'>
    >;
  }

  patch<TPath extends ConcreteApiPaths>(
    path: TPath,
    options: {
      body?: BodyForPath<TPath, 'PATCH'>;
      query?: QueryParamsForPath<TPath, 'PATCH'>;
    },
  ): Promise<ResponseForPath<TPath, 'PATCH'>> {
    return this.request('PATCH', path, options) as Promise<ResponseForPath<TPath, 'PATCH'>>;
  }

  post<TPath extends ConcreteApiPaths>(
    path: TPath,
    options: {
      body?: BodyForPath<TPath, 'POST'>;
      query?: QueryParamsForPath<TPath, 'POST'>;
    },
  ): Promise<ResponseForPath<TPath, 'POST'>> {
    return this.request('POST', path, options) as Promise<ResponseForPath<TPath, 'POST'>>;
  }

  put<TPath extends ConcreteApiPaths>(
    path: TPath,
    options: {
      body: BodyForPath<TPath, 'PUT'>;
      query?: QueryParamsForPath<TPath, 'PUT'>;
    },
  ): Promise<ResponseForPath<TPath, 'PUT'>> {
    return this.request('PUT', path, options) as Promise<ResponseForPath<TPath, 'PUT'>>;
  }

  private async request(
    method: HttpMethod,
    path: string,
    payload: { body?: unknown; query?: unknown },
  ): Promise<unknown> {
    const pathSegments = splitPath(path);
    let matchedTemplate: string | undefined;

    for (const route of this.routes) {
      const params = matchSegments(route.segments, pathSegments);
      if (!params) {
        continue;
      }

      matchedTemplate = route.template;
      const handler = route.handlers[method];
      if (handler) {
        return await handler({ ...payload, params });
      }
    }

    if (matchedTemplate) {
      throw new DataApiError(
        ErrorCode.METHOD_NOT_ALLOWED,
        [method, 'is not supported for', matchedTemplate].join(' '),
      );
    }

    throw new DataApiError(
      ErrorCode.NOT_FOUND,
      ['DataApi route not found:', method, path].join(' '),
    );
  }
}

function compileRoutes(handlers: ApiImplementation): CompiledRoute[] {
  return Object.entries(handlers)
    .map(([template, methods]) => ({
      handlers: methods as Partial<Record<HttpMethod, RouteHandler>>,
      segments: splitPath(template),
      template,
    }))
    .sort((left, right) => routeSpecificity(right) - routeSpecificity(left));
}

function routeSpecificity(route: CompiledRoute): number {
  return (
    route.segments.length * 100 +
    route.segments.filter((segment) => !segment.startsWith(':')).length
  );
}

function splitPath(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function matchSegments(
  templateSegments: readonly string[],
  pathSegments: readonly string[],
): Record<string, string> | null {
  return matchFrom(templateSegments, pathSegments, 0, 0, {});
}

function matchFrom(
  templateSegments: readonly string[],
  pathSegments: readonly string[],
  templateIndex: number,
  pathIndex: number,
  params: Record<string, string>,
): Record<string, string> | null {
  if (templateIndex === templateSegments.length) {
    return pathIndex === pathSegments.length ? params : null;
  }

  const templateSegment = templateSegments[templateIndex];
  if (!templateSegment) {
    return null;
  }

  if (templateSegment.startsWith(':') && templateSegment.endsWith('*')) {
    const key = templateSegment.slice(1, -1);
    const suffixLength = templateSegments.length - templateIndex - 1;
    const maxConsumed = pathSegments.length - pathIndex - suffixLength;
    for (let consumed = maxConsumed; consumed >= 1; consumed -= 1) {
      const captured = pathSegments.slice(pathIndex, pathIndex + consumed);
      const next = matchFrom(
        templateSegments,
        pathSegments,
        templateIndex + 1,
        pathIndex + consumed,
        { ...params, [key]: captured.map(decodePathSegment).join('/') },
      );
      if (next) {
        return next;
      }
    }
    return null;
  }

  const pathSegment = pathSegments[pathIndex];
  if (pathSegment === undefined) {
    return null;
  }
  if (templateSegment.startsWith(':')) {
    return matchFrom(templateSegments, pathSegments, templateIndex + 1, pathIndex + 1, {
      ...params,
      [templateSegment.slice(1)]: decodePathSegment(pathSegment),
    });
  }
  if (templateSegment !== pathSegment) {
    return null;
  }
  return matchFrom(templateSegments, pathSegments, templateIndex + 1, pathIndex + 1, params);
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new DataApiError(
      ErrorCode.BAD_REQUEST,
      ['Invalid encoded path segment:', segment].join(' '),
    );
  }
}
