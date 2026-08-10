import { useCallback, useEffect, useRef, useState } from 'react';

import { useBackendModule } from '@/frontend/data';

import { useProviderOauth } from './useProviderOauth';

export function useCherryInOauth(providerId: string) {
  const cherryin = useBackendModule('cherryin');
  const oauth = useProviderOauth(providerId);
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const hasAutoFetched = useRef(false);
  const isAuthenticated = oauth.status?.isAuthenticated === true;

  const fetchData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const result = await cherryin.getBalance();
      setBalance(result?.balance ?? null);
    } catch {
      setBalance(null);
    } finally {
      setIsLoadingData(false);
    }
  }, [cherryin]);

  useEffect(() => {
    if (isAuthenticated && !hasAutoFetched.current) {
      hasAutoFetched.current = true;
      void fetchData();
    }
    if (!isAuthenticated) {
      hasAutoFetched.current = false;
    }
  }, [fetchData, isAuthenticated]);

  return {
    ...oauth,
    balance: isAuthenticated ? balance : null,
    fetchData,
    isLoadingData: isAuthenticated && isLoadingData,
  };
}
