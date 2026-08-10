import type { ApiKeyEntry } from '@cherrystudio/universal/data/types/provider';
import { useCallback, useState } from 'react';

import {
  cloneApiKeyEntries,
  createEmptyApiKeyEntry,
  normalizeApiKeyEntries,
} from '../utils/providerApiServiceApiKeys';

/**
 * API key editing state, owned by the mounted API key form. The caller passes the
 * persisted keys, so the entries are ready on the first frame and die with the form —
 * saved values come back through the API keys query, never through this state.
 */
export function useProviderApiServiceApiKeysDraft(apiKeys: readonly ApiKeyEntry[]) {
  const [entries, setEntries] = useState<ApiKeyEntry[]>(() =>
    cloneApiKeyEntries(normalizeApiKeyEntries(apiKeys)),
  );

  const addKey = useCallback(() => {
    setEntries((current) => [...current, createEmptyApiKeyEntry()]);
  }, []);

  const removeKey = useCallback((id: string) => {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const restoreKey = useCallback((entry: ApiKeyEntry, index: number) => {
    setEntries((current) => {
      if (current.some((item) => item.id === entry.id)) {
        return current;
      }

      const next = [...current];
      next.splice(Math.min(Math.max(index, 0), next.length), 0, entry);
      return next;
    });
  }, []);

  const updateKey = useCallback((id: string, key: string) => {
    setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, key } : entry)));
  }, []);

  const updateKeyEnabled = useCallback((id: string, isEnabled: boolean) => {
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, isEnabled } : entry)),
    );
  }, []);

  return {
    addKey,
    entries,
    removeKey,
    restoreKey,
    updateKey,
    updateKeyEnabled,
  };
}
