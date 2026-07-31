import { createContext, type PropsWithChildren, use } from 'react';

import type { ApiClient } from '@/shared/data/api/types';

const DataApiContext = createContext<ApiClient | null>(null);

type DataApiProviderProps = PropsWithChildren<{
  dataApi: ApiClient;
}>;

export function DataApiProvider({ children, dataApi }: DataApiProviderProps) {
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
