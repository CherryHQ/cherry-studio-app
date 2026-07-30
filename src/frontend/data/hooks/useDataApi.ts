import {
  type InfiniteData,
  type QueryClient,
  useQueryClient,
  useInfiniteQuery as useTanStackInfiniteQuery,
  useMutation as useTanStackMutation,
  useQuery as useTanStackQuery,
} from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useApiClient } from '@/frontend/data/DataApiProvider';
import type {
  ApiPath,
  BodyForPath,
  ConcreteApiPaths,
  ParamsForPath,
  QueryParamsForPath,
  ResponseForPath,
  TemplateApiPaths,
} from '@/shared/data/api/paths';
import type {
  ApiClient,
  CursorPaginationResponse,
  InferPaginationMode,
} from '@/shared/data/api/types';

type DataApiQueryKey = readonly [string] | readonly [string, unknown];
type MutationMethod = 'DELETE' | 'PATCH' | 'POST' | 'PUT';

export type ParamsOption<
  TPath extends string,
  TMethod extends string,
> = TPath extends TemplateApiPaths
  ? [ParamsForPath<TPath, TMethod>] extends [never]
    ? { params?: never }
    : { params: ParamsForPath<TPath, TMethod> }
  : { params?: never };

export type TriggerArgs<TPath extends ApiPath, TMethod extends MutationMethod> = ParamsOption<
  TPath,
  TMethod
> & {
  body?: BodyForPath<TPath, TMethod>;
  query?: QueryParamsForPath<TPath, TMethod>;
};

type RefreshContext<TPath extends ApiPath, TMethod extends MutationMethod> = {
  args: TriggerArgs<TPath, TMethod> | undefined;
  result: ResponseForPath<TPath, TMethod>;
};

type RefreshOption<TPath extends ApiPath, TMethod extends MutationMethod> =
  | readonly string[]
  | ((context: RefreshContext<TPath, TMethod>) => readonly string[]);

export function useQuery<TPath extends ApiPath>(
  path: TPath,
  options?: ParamsOption<TPath, 'GET'> & {
    enabled?: boolean;
    query?: QueryParamsForPath<TPath, 'GET'>;
    retry?: boolean | number;
    staleTime?: number;
  },
) {
  const dataApi = useApiClient();
  const enabled = options?.enabled !== false;
  const resolvedPath = enabled
    ? resolveTemplate(path, options?.params as Record<string, string | number> | undefined)
    : path;
  const query = options?.query;
  const result = useTanStackQuery<ResponseForPath<TPath, 'GET'>, Error>({
    enabled,
    queryFn: () =>
      dataApi.get(resolvedPath as ConcreteApiPaths, {
        query: query as QueryParamsForPath<ConcreteApiPaths, 'GET'>,
      }) as Promise<ResponseForPath<TPath, 'GET'>>,
    queryKey: buildQueryKey(resolvedPath, query),
    retry: options?.retry,
    staleTime: options?.staleTime,
  });

  return {
    data: result.data,
    error: result.error ?? undefined,
    isLoading: result.isLoading,
    isRefreshing: result.isFetching && !result.isLoading,
    refetch: result.refetch,
  };
}

export function useMutation<TPath extends ApiPath, TMethod extends MutationMethod>(
  method: TMethod,
  path: TPath,
  options?: {
    onError?: (error: Error) => Promise<void> | void;
    onSuccess?: (data: ResponseForPath<TPath, TMethod>) => Promise<void> | void;
    refresh?: RefreshOption<TPath, TMethod>;
  },
) {
  const dataApi = useApiClient();
  const queryClient = useQueryClient();
  const mutation = useTanStackMutation<
    ResponseForPath<TPath, TMethod>,
    Error,
    TriggerArgs<TPath, TMethod> | undefined
  >({
    mutationFn: (args) => {
      const resolvedPath = resolveTemplate(
        path,
        args?.params as Record<string, string | number> | undefined,
      );
      return request(dataApi, method, resolvedPath as ConcreteApiPaths, args);
    },
    onError: (error) => options?.onError?.(error),
    onSuccess: async (result, args) => {
      const refresh = options?.refresh;
      if (refresh) {
        const paths = typeof refresh === 'function' ? refresh({ args, result }) : refresh;
        await invalidatePaths(queryClient, paths);
      }
      await options?.onSuccess?.(result);
    },
  });
  const mutateAsync = mutation.mutateAsync;
  const trigger = useCallback(
    (args?: TriggerArgs<TPath, TMethod>) => mutateAsync(args),
    [mutateAsync],
  );

  return {
    error: mutation.error ?? undefined,
    isLoading: mutation.isPending,
    trigger,
  };
}

type CursorPaginatedPath<TPath extends ApiPath> =
  InferPaginationMode<ResponseForPath<TPath, 'GET'>> extends 'cursor' ? TPath : never;

export function useInfiniteQuery<TPath extends ApiPath>(
  path: CursorPaginatedPath<TPath>,
  options?: ParamsOption<TPath, 'GET'> & {
    enabled?: boolean;
    limit?: number;
    query?: Omit<QueryParamsForPath<TPath, 'GET'>, 'cursor' | 'limit'>;
    retry?: boolean | number;
    staleTime?: number;
  },
) {
  const dataApi = useApiClient();
  const queryClient = useQueryClient();
  const enabled = options?.enabled !== false;
  const limit = options?.limit ?? 10;
  const resolvedPath = enabled
    ? resolveTemplate(path, options?.params as Record<string, string | number> | undefined)
    : path;
  const query = options?.query;
  const queryKey = buildQueryKey(resolvedPath, { ...query, limit });
  const result = useTanStackInfiniteQuery<
    ResponseForPath<TPath, 'GET'>,
    Error,
    InfiniteData<ResponseForPath<TPath, 'GET'>, string | undefined>,
    DataApiQueryKey,
    string | undefined
  >({
    enabled,
    getNextPageParam: (lastPage) => (lastPage as CursorPaginationResponse<unknown>).nextCursor,
    initialPageParam: undefined,
    queryFn: ({ pageParam }) =>
      dataApi.get(resolvedPath as ConcreteApiPaths, {
        query: {
          ...query,
          cursor: pageParam,
          limit,
        } as QueryParamsForPath<ConcreteApiPaths, 'GET'>,
      }) as Promise<ResponseForPath<TPath, 'GET'>>,
    queryKey,
    retry: options?.retry,
    staleTime: options?.staleTime,
  });
  const pages = useMemo(() => result.data?.pages ?? [], [result.data?.pages]);
  const fetchNextPage = result.fetchNextPage;
  const loadNext = useCallback(() => {
    if (result.hasNextPage && !result.isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, result.hasNextPage, result.isFetchingNextPage]);
  const reset = useCallback(() => {
    queryClient.setQueryData<InfiniteData<ResponseForPath<TPath, 'GET'>, string | undefined>>(
      queryKey,
      (data) =>
        data ? { pageParams: data.pageParams.slice(0, 1), pages: data.pages.slice(0, 1) } : data,
    );
  }, [queryClient, queryKey]);

  return {
    error: result.error ?? undefined,
    hasNext: Boolean(result.hasNextPage),
    isLoading: result.isLoading,
    isRefreshing: result.isFetching && !result.isLoading,
    loadNext,
    pages,
    refresh: result.refetch,
    reset,
  };
}

function request<TPath extends ApiPath, TMethod extends MutationMethod>(
  dataApi: ApiClient,
  method: TMethod,
  path: ConcreteApiPaths,
  args?: TriggerArgs<TPath, TMethod>,
): Promise<ResponseForPath<TPath, TMethod>> {
  switch (method) {
    case 'DELETE':
      return dataApi.delete(path, { query: args?.query as never }) as Promise<
        ResponseForPath<TPath, TMethod>
      >;
    case 'PATCH':
      return dataApi.patch(path, {
        body: args?.body as never,
        query: args?.query as never,
      }) as Promise<ResponseForPath<TPath, TMethod>>;
    case 'POST':
      return dataApi.post(path, {
        body: args?.body as never,
        query: args?.query as never,
      }) as Promise<ResponseForPath<TPath, TMethod>>;
    case 'PUT':
      return dataApi.put(path, {
        body: args?.body as never,
        query: args?.query as never,
      }) as Promise<ResponseForPath<TPath, TMethod>>;
  }
}

function invalidatePaths(queryClient: QueryClient, paths: readonly string[]) {
  return Promise.all(
    paths.map((pattern) =>
      queryClient.invalidateQueries({
        predicate: ({ queryKey }) => matchesPath(queryKey[0], pattern),
      }),
    ),
  );
}

function matchesPath(candidate: unknown, pattern: string) {
  if (typeof candidate !== 'string') {
    return false;
  }
  if (pattern.endsWith('/*')) {
    return candidate.startsWith(pattern.slice(0, -1));
  }
  return candidate === pattern;
}

function buildQueryKey(path: string, query?: unknown): DataApiQueryKey {
  if (query && typeof query === 'object' && Object.keys(query).length > 0) {
    return [path, query];
  }
  return [path];
}

function resolveTemplate(path: string, params?: Record<string, string | number>): string {
  if (!path.includes(':')) {
    return path;
  }

  return path.replace(/(?<=\/):([a-zA-Z][a-zA-Z0-9]*)\*?/g, (_match, key: string) => {
    const value = params?.[key];
    if (value === undefined) {
      throw new Error(`Missing param "${key}" for path "${path}"`);
    }
    return String(value);
  });
}

export const __testing = { buildQueryKey, matchesPath, resolveTemplate };
