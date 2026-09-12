import { createContext, type PropsWithChildren, use } from 'react';

import type { Backend, BackendModule, BackendModuleKey } from '@/shared/contracts';

const BackendContext = createContext<Backend | null>(null);

type BackendProviderProps = PropsWithChildren<{
  backend: Backend;
}>;

export function BackendProvider({ backend, children }: BackendProviderProps) {
  return <BackendContext value={backend}>{children}</BackendContext>;
}

export function useBackendModule<TKey extends BackendModuleKey>(key: TKey): BackendModule<TKey> {
  const backend = use(BackendContext);

  if (!backend) {
    throw new Error('useBackendModule must be used within BackendProvider');
  }

  return backend[key];
}
