import { useCallback, useMemo, useState } from 'react';

import { usePreference } from '@/data/hooks';
import type { WebSearchProviderId } from '@/data/preference';
import {
  buildWebSearchApiKeyEntries,
  createEmptyWebSearchApiKeyEntry,
  normalizeWebSearchApiKeys,
  type WebSearchApiKeyEntry,
} from '../utils/webSearchApiServiceApiKeys';

type ApiKeyEntriesState = {
  entries: WebSearchApiKeyEntry[];
  persistedKey: string;
};

export function useWebSearchApiKeySettings(providerId: WebSearchProviderId | undefined) {
  const [providerOverrides, setProviderOverrides] = usePreference(
    'chat.web_search.provider_overrides',
  );
  const persistedApiKeys = useMemo(
    () =>
      normalizeWebSearchApiKeys(providerId ? (providerOverrides[providerId]?.apiKeys ?? []) : []),
    [providerId, providerOverrides],
  );
  const persistedKey = JSON.stringify([providerId, persistedApiKeys]);
  const [entriesState, setEntriesState] = useState<ApiKeyEntriesState>(() => ({
    entries: buildWebSearchApiKeyEntries(persistedApiKeys),
    persistedKey,
  }));

  if (entriesState.persistedKey !== persistedKey) {
    const pendingEntries = entriesState.entries.filter((entry) => entry.isNew);
    setEntriesState({
      entries: [...buildWebSearchApiKeyEntries(persistedApiKeys), ...pendingEntries],
      persistedKey,
    });
  }

  const entries = entriesState.entries;

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
    setEntriesState((current) => ({
      ...current,
      entries: current.entries.some((entry) => entry.isNew)
        ? current.entries
        : [...current.entries, createEmptyWebSearchApiKeyEntry()],
    }));
  }, []);

  const removeApiKey = useCallback((id: string) => {
    setEntriesState((current) => ({
      ...current,
      entries: current.entries.filter((entry) => entry.id !== id),
    }));
  }, []);

  const updateApiKey = useCallback((id: string, key: string) => {
    setEntriesState((current) => ({
      ...current,
      entries: current.entries.map((entry) => (entry.id === id ? { ...entry, key } : entry)),
    }));
  }, []);

  return {
    addApiKey,
    entries,
    removeApiKey,
    saveApiKeys,
    updateApiKey,
  };
}
