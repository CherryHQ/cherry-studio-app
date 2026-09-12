import { usePathname, useRouter } from 'expo-router';
import { useCallback } from 'react';

import { providerSetupHref } from './providerSetupRoute';

/** Opens provider setup while retaining the surface that requested it. */
export function useOpenProviderSetup(returnTo?: string) {
  const pathname = usePathname();
  const router = useRouter();
  const target = returnTo ?? pathname;

  return useCallback(() => {
    router.push(providerSetupHref(target));
  }, [router, target]);
}
