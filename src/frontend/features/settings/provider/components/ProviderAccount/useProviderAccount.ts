import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { clearInitialURL } from 'expo-linking';
import { useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useRef, useState } from 'react';
import { Keyboard } from 'react-native';

import { queryKeys, useBackendModule } from '@/frontend/data';
import {
  ProviderAccountError,
  type ProviderAccountErrorReason,
  type ProviderAccountsModule,
} from '@/shared/contracts';

export async function refreshAccountProvider(
  queryClient: QueryClient,
  accounts: ProviderAccountsModule,
  providerId: string,
) {
  queryClient.setQueryData(
    queryKeys.providers.account(providerId),
    await accounts.getStatus(providerId),
  );
  await Promise.all(
    [
      queryKeys.providers.apiKeys(providerId),
      queryKeys.providers.detail(providerId),
      queryKeys.providers.list(),
      queryKeys.providers.page(),
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

export function useProviderAccount(
  providerId: string,
  onKeysChanged: () => Promise<void>,
  onBusyChange: (busy: boolean) => void,
) {
  const accounts = useBackendModule('providers').accounts;
  const queryClient = useQueryClient();
  const [error, setError] = useState<ProviderAccountErrorReason | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const acting = useRef(false);
  const status = useQuery({
    queryKey: queryKeys.providers.account(providerId),
    queryFn: () => accounts.getStatus(providerId),
    retry: false,
    staleTime: Infinity,
  });
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await accounts.refresh(providerId);
      queryClient.setQueryData(queryKeys.providers.account(providerId), next);
      setError(null);
    } catch (error) {
      setError(error instanceof ProviderAccountError ? error.reason : 'request');
      // An expired/revoked grant changes the stored status even when the request failed.
      await accounts
        .getStatus(providerId)
        .then((next) => queryClient.setQueryData(queryKeys.providers.account(providerId), next))
        .catch(() => undefined);
    } finally {
      setRefreshing(false);
    }
  }, [accounts, providerId, queryClient]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  async function act(action: () => Promise<void>) {
    if (acting.current) return;
    acting.current = true;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    Keyboard.dismiss();
    try {
      await action();
      await refreshAccountProvider(queryClient, accounts, providerId);
      await onKeysChanged();
    } catch (error) {
      const reason = error instanceof ProviderAccountError ? error.reason : 'request';
      if (reason !== 'cancelled') setError(reason);
    } finally {
      acting.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }

  const login = () =>
    act(async () => {
      const attempt = await accounts.begin(providerId);
      try {
        const result = await WebBrowser.openAuthSessionAsync(
          attempt.authorizationUrl,
          attempt.redirectUrl,
        );
        if (result.type === 'success') {
          clearInitialURL();
          await accounts.receiveRedirect(result.url);
        }
      } finally {
        await accounts.cancel(attempt.attemptId);
      }
      await refresh();
    });
  const logout = () => act(() => accounts.logout(providerId));

  return {
    busy,
    error: error ?? (status.isError ? 'storage' : null),
    login,
    logout,
    refresh,
    refreshing,
    status,
  };
}
