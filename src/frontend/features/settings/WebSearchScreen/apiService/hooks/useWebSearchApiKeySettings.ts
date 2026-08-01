import { useCallback, useState } from 'react';
import { usePreference } from '@/frontend/data/hooks';
import type { WebSearchProviderId } from '@cherrystudio/shared/data/preference';
import {
  buildWebSearchApiKeyEntries,
  createEmptyWebSearchApiKeyEntry,
  normalizeWebSearchApiKeys,
  type WebSearchApiKeyEntry,
} from '../utils/webSearchApiServiceApiKeys';

/**
 * API key rows for one web search provider, owned by the mounted screen.
 *
 * Preferences are hydrated before any screen renders, so the persisted keys are already
 * there on the first frame and the rows never need to be re-derived from the store: they
 * are seeded once and die with the screen. A row the user is still typing into therefore
 * cannot be overwritten by an unrelated preference write.
 */
export function useWebSearchApiKeySettings(providerId: WebSearchProviderId | undefined) {
  const [providerOverrides, setProviderOverrides] = usePreference(
    'chat.web_search.provider_overrides',
  );
  const [entries, setEntries] = useState<WebSearchApiKeyEntry[]>(() =>
    buildWebSearchApiKeyEntries(providerId ? (providerOverrides[providerId]?.apiKeys ?? []) : []),
  );

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

  // A newly added row becomes an ordinary one once its key is stored. Keeping its id
  // across the transition leaves the field mounted, so it does not lose focus.
  const promoteApiKey = useCallback((id: string) => {
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, isNew: false } : entry)),
    );
  }, []);

  return {
    addApiKey,
    entries,
    promoteApiKey,
    removeApiKey,
    saveApiKeys,
    updateApiKey,
  };
}
