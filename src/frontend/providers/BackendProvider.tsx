import { createContext, type PropsWithChildren, use } from 'react';

import type {
  MobileBackend,
  MobileBackendModule,
  MobileBackendModuleKey,
} from '@/shared/contracts';

const BackendContext = createContext<MobileBackend | null>(null);

type BackendProviderProps = PropsWithChildren<{
  backend: MobileBackend;
}>;

export function BackendProvider({ backend, children }: BackendProviderProps) {
  return <BackendContext value={backend}>{children}</BackendContext>;
}

export function useBackendModule<TKey extends MobileBackendModuleKey>(
  key: TKey,
): MobileBackendModule<TKey> {
  const backend = use(BackendContext);

  if (!backend) {
    throw new Error('useBackendModule must be used within BackendProvider');
  }

  return backend[key];
}
