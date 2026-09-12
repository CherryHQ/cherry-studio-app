import { useQueryClient } from '@tanstack/react-query';
import { createContext, type PropsWithChildren, use, useEffect } from 'react';

import type { ApiClient } from '@/shared/data/api/types';

const DataApiContext = createContext<ApiClient | null>(null);

type DataApiProviderProps = PropsWithChildren<{
  dataApi: ApiClient;
}>;

export function DataApiProvider({ children, dataApi }: DataApiProviderProps) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const paths = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = dataApi.subscribeChanges?.((changedPaths) => {
      for (const path of changedPaths) paths.add(path);
      // Coalesce a burst without postponing refresh indefinitely during long tool loops.
      timer ??= setTimeout(() => {
        const changed = new Set(paths);
        paths.clear();
        timer = undefined;
        void queryClient.invalidateQueries({
          predicate: (query) => changed.has(String(query.queryKey[0])),
        });
      }, 300);
    });
    return () => {
      unsubscribe?.();
      if (timer) clearTimeout(timer);
    };
  }, [dataApi, queryClient]);
  return <DataApiContext value={dataApi}>{children}</DataApiContext>;
}

/** Internal transport access for the typed endpoint hooks. */
export function useApiClient(): ApiClient {
  const dataApi = use(DataApiContext);

  if (!dataApi) {
    throw new Error('Data API hooks must be used within DataApiProvider');
  }

  return dataApi;
}
