import { createContext, type PropsWithChildren, use } from 'react';

import type { PreferenceClient } from '@/shared/data/preference';

const PreferenceContext = createContext<PreferenceClient | null>(null);

type PreferenceProviderProps = PropsWithChildren<{
  preference: PreferenceClient;
}>;

export function PreferenceProvider({ children, preference }: PreferenceProviderProps) {
  return <PreferenceContext value={preference}>{children}</PreferenceContext>;
}

export function usePreferenceClient(): PreferenceClient {
  const preference = use(PreferenceContext);

  if (!preference) {
    throw new Error('Preference hooks must be used within PreferenceProvider');
  }

  return preference;
}
