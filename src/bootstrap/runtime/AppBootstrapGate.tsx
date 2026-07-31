import type { PropsWithChildren } from 'react';

import { useAppBootstrapState } from './AppBootstrapProvider';

export function AppBootstrapGate({ children }: PropsWithChildren) {
  const state = useAppBootstrapState();

  if (state.status === 'loading') {
    return null;
  }

  if (state.status === 'error') {
    throw state.error;
  }

  return children;
}
