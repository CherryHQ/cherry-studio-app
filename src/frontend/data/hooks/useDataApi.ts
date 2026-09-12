import {
  type InfiniteData,
  keepPreviousData,
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

/**
 * react-query merges options as `{...clientDefaults, ...options}`, so passing an explicit
 * `staleTime: undefined` *overrides* the client default (see `createMobileQueryClient`) and
 * leaves the query permanently stale — every observer that mounts refetches. Forward query
 * overrides only when a caller actually set them, so unset callers inherit the client defaults.
 */
function callerQueryOverrides(options?: {
  gcTime?: number;
  refetchOnMount?: boolean | 'always';
  retry?: boolean | number;
  staleTime?: number;
}) {
  return {
    ...(options?.gcTime === undefined ? {} : { gcTime: options.gcTime }),
    ...(options?.refetchOnMount === undefined ? {} : { refetchOnMount: options.refetchOnMount }),
    ...(options?.retry === undefined ? {} : { retry: options.retry }),
    ...(options?.staleTime === undefined ? {} : { staleTime: options.staleTime }),
  };
}

export function useQuery<TPath extends ApiPath>(
  path: TPath,
  options?: ParamsOption<TPath, 'GET'> & {
    enabled?: boolean;
    /** Keep the previous key's data on screen while the new key loads. */
    keepPreviousData?: boolean;
    query?: QueryParamsForPath<TPath, 'GET'>;
    /**
     * Poll while mounted. A function form receives the latest data and returns
     * the next delay, or `false` to stop (e.g. once a job reaches a terminal
     * status).
     */
    refetchInterval?:
      | number
      | ((data: ResponseForPath<TPath, 'GET'> | undefined) => number | false);
    retry?: boolean | number;
    staleTime?: number;
  },
) {
  const dataApi = useApiClient();
  const enabled = options?.enabled !== false;
  const resolvedPath = resolveTemplate(
    path,
    options?.params as Record<string, string | number> | undefined,
  );
  const query = options?.query;
  const refetchInterval = options?.refetchInterval;
  const result = useTanStackQuery<ResponseForPath<TPath, 'GET'>, Error>({
    enabled,
    placeholderData: options?.keepPreviousData ? keepPreviousData : undefined,
    queryFn: () =>
      dataApi.get(resolvedPath as ConcreteApiPaths, {
        query: query as QueryParamsForPath<ConcreteApiPaths, 'GET'>,
      }) as Promise<ResponseForPath<TPath, 'GET'>>,
    queryKey: buildQueryKey(resolvedPath, query),
    ...(refetchInterval === undefined
      ? {}
      : {
          refetchInterval:
            typeof refetchInterval === 'function'
              ? (tanStackQuery: { state: { data?: ResponseForPath<TPath, 'GET'> } }) =>
                  refetchInterval(tanStackQuery.state.data)
              : refetchInterval,
        }),
    ...callerQueryOverrides(options),
  });

  return {
    data: result.data,
    error: result.error ?? undefined,
    isError: result.isError,
    isLoading: result.isLoading,
    isPending: result.isPending,
    isRefreshing: result.isFetching && !result.isLoading,
    refetch: result.refetch,
  };
}

export function usePrefetch() {
  const dataApi = useApiClient();
  const queryClient = useQueryClient();

  return useCallback(
    <TPath extends ApiPath>(
      path: TPath,
      options?: ParamsOption<TPath, 'GET'> & {
        query?: QueryParamsForPath<TPath, 'GET'>;
        staleTime?: number;
      },
    ) => {
      const resolvedPath = resolveTemplate(
        path,
        options?.params as Record<string, string | number> | undefined,
      );
      const query = options?.query;
      return queryClient.prefetchQuery({
        queryFn: () =>
          dataApi.get(resolvedPath as ConcreteApiPaths, {
            query: query as QueryParamsForPath<ConcreteApiPaths, 'GET'>,
          }) as Promise<ResponseForPath<TPath, 'GET'>>,
        queryKey: buildQueryKey(resolvedPath, query),
        staleTime: options?.staleTime,
      });
    },
    [dataApi, queryClient],
  );
}

export function useMutation<
  TPath extends ApiPath,
  TMethod extends MutationMethod,
  TContext = unknown,
>(
  method: TMethod,
  path: TPath,
  options?: {
    onError?: (
      error: Error,
      variables: TriggerArgs<TPath, TMethod> | undefined,
      context: TContext | undefined,
    ) => Promise<void> | void;
    /** Runs before the mutation request; its return value becomes the context passed to the other callbacks. */
    onMutate?: (variables: TriggerArgs<TPath, TMethod> | undefined) => Promise<TContext> | TContext;
    onSettled?: (
      data: ResponseForPath<TPath, TMethod> | undefined,
      error: Error | null,
      variables: TriggerArgs<TPath, TMethod> | undefined,
      context: TContext | undefined,
    ) => Promise<void> | void;
    onSuccess?: (
      data: ResponseForPath<TPath, TMethod>,
      variables: TriggerArgs<TPath, TMethod> | undefined,
      context: TContext,
    ) => Promise<void> | void;
    refresh?: RefreshOption<TPath, TMethod>;
  },
) {
  const dataApi = useApiClient();
  const queryClient = useQueryClient();
  const mutation = useTanStackMutation<
    ResponseForPath<TPath, TMethod>,
    Error,
    TriggerArgs<TPath, TMethod> | undefined,
    TContext
  >({
    mutationFn: (args) => {
      const resolvedPath = resolveTemplate(
        path,
        args?.params as Record<string, string | number> | undefined,
      );
      return request(dataApi, method, resolvedPath as ConcreteApiPaths, args);
    },
    onError: (error, variables, context) => options?.onError?.(error, variables, context),
    onMutate: options?.onMutate,
    onSettled: (data, error, variables, context) =>
      options?.onSettled?.(data, error, variables, context),
    onSuccess: async (result, args, context) => {
      const refresh = options?.refresh;
      if (refresh) {
        const paths = typeof refresh === 'function' ? refresh({ args, result }) : refresh;
        await invalidatePaths(queryClient, paths);
      }
      await options?.onSuccess?.(result, args, context);
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
    gcTime?: number;
    limit?: number;
    query?: Omit<QueryParamsForPath<TPath, 'GET'>, 'cursor' | 'limit'>;
    refetchOnMount?: boolean | 'always';
    retry?: boolean | number;
    staleTime?: number;
  },
) {
  const dataApi = useApiClient();
  const queryClient = useQueryClient();
  const enabled = options?.enabled !== false;
  const limit = options?.limit ?? 10;
  const resolvedPath = resolveTemplate(
    path,
    options?.params as Record<string, string | number> | undefined,
  );
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
    ...callerQueryOverrides(options),
  });
  const pages = useMemo(() => result.data?.pages ?? [], [result.data?.pages]);
  const fetchNextPage = result.fetchNextPage;
  const loadNext = useCallback(async () => {
    if (result.hasNextPage && !result.isFetchingNextPage) {
      await fetchNextPage();
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
    isLoadingMore: result.isFetchingNextPage,
    isRefreshing: result.isFetching && !result.isLoading,
    loadNext,
    pages,
    refresh: result.refetch,
    reset,
  };
}

export function usePrefetchInfiniteQuery() {
  const dataApi = useApiClient();
  const queryClient = useQueryClient();

  return useCallback(
    <TPath extends ApiPath>(
      path: CursorPaginatedPath<TPath>,
      options?: ParamsOption<TPath, 'GET'> & {
        limit?: number;
        query?: Omit<QueryParamsForPath<TPath, 'GET'>, 'cursor' | 'limit'>;
        staleTime?: number;
      },
    ) => {
      const limit = options?.limit ?? 10;
      const resolvedPath = resolveTemplate(
        path,
        options?.params as Record<string, string | number> | undefined,
      );
      const query = options?.query;

      return queryClient.prefetchInfiniteQuery<
        ResponseForPath<TPath, 'GET'>,
        Error,
        InfiniteData<ResponseForPath<TPath, 'GET'>, string | undefined>,
        DataApiQueryKey,
        string | undefined
      >({
        getNextPageParam: (lastPage: ResponseForPath<TPath, 'GET'>) =>
          (lastPage as CursorPaginationResponse<unknown>).nextCursor,
        initialPageParam: undefined,
        queryFn: ({ pageParam }) =>
          dataApi.get(resolvedPath as ConcreteApiPaths, {
            query: {
              ...query,
              cursor: pageParam,
              limit,
            } as QueryParamsForPath<ConcreteApiPaths, 'GET'>,
          }) as Promise<ResponseForPath<TPath, 'GET'>>,
        queryKey: buildQueryKey(resolvedPath, { ...query, limit }),
        staleTime: options?.staleTime,
      });
    },
    [dataApi, queryClient],
  );
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
