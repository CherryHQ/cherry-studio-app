import { useIsFormContentConstrained } from '@/frontend/appShell/layout';

/** Two columns once the window outgrows the form column; one on a phone. */
export function useMarketplaceColumns() {
  return useIsFormContentConstrained() ? 2 : 1;
}
