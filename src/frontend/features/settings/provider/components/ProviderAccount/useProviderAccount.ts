import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { setStringAsync } from 'expo-clipboard';
import { clearInitialURL } from 'expo-linking';
import { useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Linking } from 'react-native';

import { queryKeys, useBackendModule } from '@/frontend/data';
import {
  ProviderAccountError,
  type ProviderAccountErrorReason,
  type ProviderAccountsModule,
  type ProviderSignInEvent,
  type ProviderSignInPrompt,
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
  interactive = false,
) {
  const accounts = useBackendModule('providers').accounts;
  const queryClient = useQueryClient();
  const [error, setError] = useState<ProviderAccountErrorReason | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const acting = useRef(false);
  const loginController = useRef<AbortController | null>(null);
  const promptAnswer = useRef<((value: string) => void) | null>(null);
  const [loginEvent, setLoginEvent] = useState<ProviderSignInEvent | null>(null);
  const [loginPrompt, setLoginPrompt] = useState<ProviderSignInPrompt | null>(null);
  useEffect(
    () => () => {
      loginController.current?.abort();
    },
    [providerId],
  );
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

  const login = (mode: 'default' | 'enterprise' = 'default') =>
    act(async () => {
      if (interactive) {
        const controller = new AbortController();
        loginController.current = controller;
        setLoginEvent({ type: 'progress' });
        try {
          await accounts.signIn(providerId, {
            signal: controller.signal,
            notify: setLoginEvent,
            prompt: async (prompt) => {
              // Ordinary Copilot accounts use github.com without an extra input step.
              if (prompt.type === 'enterprise-domain' && mode === 'default') return '';
              return new Promise<string>((resolve, reject) => {
                const signal = prompt.signal ?? controller.signal;
                const clear = () => {
                  signal.removeEventListener('abort', abort);
                  promptAnswer.current = null;
                  setLoginPrompt(null);
                };
                const abort = () => {
                  clear();
                  reject(new ProviderAccountError('cancelled'));
                };
                if (signal.aborted) {
                  abort();
                  return;
                }
                signal.addEventListener('abort', abort, { once: true });
                promptAnswer.current = (value) => {
                  clear();
                  resolve(value);
                };
                setLoginPrompt(prompt);
              });
            },
          });
        } finally {
          loginController.current = null;
          promptAnswer.current = null;
          setLoginPrompt(null);
          setLoginEvent(null);
        }
        return;
      }
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
    loginEvent,
    loginPrompt,
    cancelLogin: () => loginController.current?.abort(),
    answerPrompt: (value: string) => promptAnswer.current?.(value),
    copyLoginCode: async () => {
      if (loginEvent?.type !== 'device-code') return;
      try {
        await setStringAsync(loginEvent.code);
      } catch {
        setError('request');
      }
    },
    openLoginBrowser: async () => {
      if (loginEvent?.type !== 'device-code' && loginEvent?.type !== 'browser') return;
      try {
        if (loginEvent.type === 'browser') await Linking.openURL(loginEvent.url);
        else await WebBrowser.openBrowserAsync(loginEvent.url);
      } catch {
        setError('request');
      }
    },
    logout,
    refresh,
    refreshing,
    status,
  };
}
