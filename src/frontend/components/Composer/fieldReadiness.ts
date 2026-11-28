import { createContext } from 'react';

/** Scoped to the surface observing its native editor's layout. */
export const ComposerFieldReadyContext = createContext<((ready: boolean) => void) | undefined>(
  undefined,
);
