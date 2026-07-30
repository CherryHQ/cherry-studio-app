import type { PropsWithChildren } from 'react';

import { useDataState } from './DataProvider';

export function InitialDataGate({ children }: PropsWithChildren) {
  const state = useDataState();

  if (state.status === 'loading') {
    return null;
  }

  if (state.status === 'error') {
    throw state.error;
  }

  return children;
}
