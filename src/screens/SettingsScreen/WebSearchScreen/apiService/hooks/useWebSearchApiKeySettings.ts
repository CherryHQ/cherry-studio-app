import { useCallback, useEffect, useMemo, useState } from 'react';

import { usePreference } from '@/data/hooks';
import type { WebSearchProviderId } from '@/data/preference';
import {
  buildWebSearchApiKeyEntries,
  createEmptyWebSearchApiKeyEntry,
  normalizeWebSearchApiKeys,
  type WebSearchApiKeyEntry,
} from '../utils/webSearchApiServiceApiKeys';

export function useWebSearchApiKeySettings(providerId: WebSearchProviderId | undefined) {
  const [providerOverrides, setProviderOverrides] = usePreference(
    'chat.web_search.provider_overrides',
  );
  const persistedApiKeys = useMemo(
    () =>
      normalizeWebSearchApiKeys(providerId ? (providerOverrides[providerId]?.apiKeys ?? []) : []),
    [providerId, providerOverrides],
  );
  const [entries, setEntries] = useState<WebSearchApiKeyEntry[]>(() =>
    buildWebSearchApiKeyEntries(persistedApiKeys),
  );

  useEffect(() => {
    setEntries((current) => {
      const pendingEntries = current.filter((entry) => entry.isNew);

      return [...buildWebSearchApiKeyEntries(persistedApiKeys), ...pendingEntries];
    });
  }, [persistedApiKeys]);

  const saveApiKeys = useCallback(
    async (nextEntries: readonly WebSearchApiKeyEntry[]) => {
      if (!providerId) {
        return;
      }

      await setProviderOverrides({
        ...providerOverrides,
        [providerId]: {
          ...providerOverrides[providerId],
          apiKeys: normalizeWebSearchApiKeys(nextEntries.map((entry) => entry.key)),
        },
      });
    },
    [providerId, providerOverrides, setProviderOverrides],
  );

  const addApiKey = useCallback(() => {
    setEntries((current) =>
      current.some((entry) => entry.isNew)
        ? current
        : [...current, createEmptyWebSearchApiKeyEntry()],
    );
  }, []);

  const removeApiKey = useCallback((id: string) => {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const updateApiKey = useCallback((id: string, key: string) => {
    setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, key } : entry)));
  }, []);

  return {
    addApiKey,
    entries,
    removeApiKey,
    saveApiKeys,
    updateApiKey,
  };
}
