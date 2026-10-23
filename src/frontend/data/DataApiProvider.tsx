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
        const fileIds = new Set(
          [...changed].flatMap((path) =>
            path.startsWith('/files/entries/') ? [path.slice('/files/entries/'.length)] : [],
          ),
        );
        void queryClient.invalidateQueries({
          predicate: ({ queryKey: [resource, idOrKind, entries], meta }) =>
            changed.has(String(resource)) ||
            (fileIds.size > 0 &&
              ((Array.isArray(meta?.fileEntryIds) &&
                meta.fileEntryIds.some((id) => fileIds.has(id))) ||
                (resource === 'files' &&
                  (fileIds.has(String(idOrKind)) ||
                    (idOrKind === 'preview-uri-page' &&
                      Array.isArray(entries) &&
                      entries.some((entry) => fileIds.has(entry.id))))))),
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

/**
 * Public through @/frontend/data for imperative resource work and custom Query lifetimes.
 * Prefer the endpoint hooks for ordinary reads and mutations. Direct callers own cancellation,
 * cache keys and refresh behavior; the client remains the typed in-process resource boundary.
 */
export function useApiClient(): ApiClient {
  const dataApi = use(DataApiContext);

  if (!dataApi) {
    throw new Error('Data API hooks must be used within DataApiProvider');
  }

  return dataApi;
}
