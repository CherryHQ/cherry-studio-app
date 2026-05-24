import { useCallback, useEffect, useSyncExternalStore } from 'react';

import type { EndpointType } from '@/data/types/model';
import type { ApiKeyEntry, AuthConfig, Provider } from '@/data/types/provider';

import {
  buildApiKeyEntriesFromInput,
  buildApiKeysInputFromEntries,
  createEmptyApiKeyEntry,
} from '../utils/providerApiServiceApiKeys';
import type { AuthDraft } from '../utils/providerApiServiceAuthDraft';
import {
  canAddEndpointToDraft,
  createDraftSnapshot,
  type DraftSnapshot,
  getBaseUrlForEndpoint,
} from '../utils/providerApiServiceDraft';
import {
  getPrimaryEndpoint,
  resolveVisibleEndpointTypes,
} from '../utils/providerApiServiceEndpointRules';

type DraftStoreState = Record<string, DraftSnapshot | null>;

let draftStoreState: DraftStoreState = {};
const draftStoreListeners = new Set<() => void>();

function emitDraftStoreChange() {
  for (const listener of draftStoreListeners) {
    listener();
  }
}

function subscribeDraftStore(listener: () => void) {
  draftStoreListeners.add(listener);
  return () => {
    draftStoreListeners.delete(listener);
  };
}

function getDraftStoreSnapshot() {
  return draftStoreState;
}

function setProviderDraft(
  providerId: string,
  updater: (current: DraftSnapshot | null) => DraftSnapshot | null,
) {
  const current = draftStoreState[providerId] ?? null;
  const next = updater(current);

  if (next === current) {
    return;
  }

  draftStoreState = {
    ...draftStoreState,
    [providerId]: next,
  };
  emitDraftStoreChange();
}

export function useProviderApiServiceDraft({
  apiKeys,
  authConfig,
  provider,
}: {
  apiKeys: readonly ApiKeyEntry[] | undefined;
  authConfig: AuthConfig | null | undefined;
  provider: Provider | undefined;
}) {
  const draftStore = useSyncExternalStore(
    subscribeDraftStore,
    getDraftStoreSnapshot,
    getDraftStoreSnapshot,
  );
  const providerId = provider?.id;
  const draft = providerId ? (draftStore[providerId] ?? null) : null;

  useEffect(() => {
    if (!provider || apiKeys === undefined || authConfig === undefined) {
      return;
    }

    setProviderDraft(
      provider.id,
      (current) => current ?? createDraftSnapshot(provider, apiKeys, authConfig),
    );
  }, [apiKeys, authConfig, provider]);

  const updateEndpointBaseUrl = useCallback(
    (endpoint: EndpointType, value: string) => {
      if (!providerId) {
        return;
      }

      setProviderDraft(providerId, (current) =>
        current
          ? {
              ...current,
              baseUrlByEndpoint: {
                ...current.baseUrlByEndpoint,
                [endpoint]: value,
              },
            }
          : current,
      );
    },
    [providerId],
  );

  const addEndpoint = useCallback(
    (endpoint: EndpointType) => {
      if (!providerId) {
        return;
      }

      setProviderDraft(providerId, (current) =>
        current && canAddEndpointToDraft(current, endpoint)
          ? {
              ...current,
              baseUrlByEndpoint: {
                ...current.baseUrlByEndpoint,
                [endpoint]: current.baseUrlByEndpoint[endpoint] ?? '',
              },
              visibleEndpointTypes: [...current.visibleEndpointTypes, endpoint],
            }
          : current,
      );
    },
    [providerId],
  );

  const removeEndpoint = useCallback(
    (endpoint: EndpointType) => {
      if (!providerId) {
        return;
      }

      setProviderDraft(providerId, (current) => {
        if (!current || endpoint === current.primaryEndpoint) {
          return current;
        }

        const { [endpoint]: _removedBaseUrl, ...baseUrlByEndpoint } = current.baseUrlByEndpoint;

        return {
          ...current,
          baseUrlByEndpoint,
          visibleEndpointTypes: current.visibleEndpointTypes.filter((item) => item !== endpoint),
        };
      });
    },
    [providerId],
  );

  const updateAuthDraft = useCallback(
    (updates: Partial<AuthDraft>) => {
      if (!providerId) {
        return;
      }

      setProviderDraft(providerId, (current) =>
        current
          ? {
              ...current,
              authDraft: {
                ...current.authDraft,
                ...updates,
              },
            }
          : current,
      );
    },
    [providerId],
  );

  const updateApiKeysInput = useCallback(
    (apiKeysInput: string) => {
      if (!providerId) {
        return;
      }

      setProviderDraft(providerId, (current) =>
        current
          ? {
              ...current,
              apiKeyEntries: buildApiKeyEntriesFromInput(apiKeysInput, current.apiKeyEntries),
              apiKeysInput,
            }
          : current,
      );
    },
    [providerId],
  );

  const addApiKey = useCallback(() => {
    if (!providerId) {
      return;
    }

    setProviderDraft(providerId, (current) => {
      if (!current) {
        return current;
      }

      const apiKeyEntries = [...current.apiKeyEntries, createEmptyApiKeyEntry()];

      return {
        ...current,
        apiKeyEntries,
        apiKeysInput: buildApiKeysInputFromEntries(apiKeyEntries),
      };
    });
  }, [providerId]);

  const removeApiKey = useCallback(
    (id: string) => {
      if (!providerId) {
        return;
      }

      setProviderDraft(providerId, (current) => {
        if (!current) {
          return current;
        }

        const apiKeyEntries = current.apiKeyEntries.filter((entry) => entry.id !== id);

        return {
          ...current,
          apiKeyEntries,
          apiKeysInput: buildApiKeysInputFromEntries(apiKeyEntries),
        };
      });
    },
    [providerId],
  );

  const updateApiKey = useCallback(
    (id: string, key: string) => {
      if (!providerId) {
        return;
      }

      setProviderDraft(providerId, (current) => {
        if (!current) {
          return current;
        }

        const apiKeyEntries = current.apiKeyEntries.map((entry) =>
          entry.id === id ? { ...entry, key } : entry,
        );

        return {
          ...current,
          apiKeyEntries,
          apiKeysInput: buildApiKeysInputFromEntries(apiKeyEntries),
        };
      });
    },
    [providerId],
  );

  const updateApiKeyEnabled = useCallback(
    (id: string, isEnabled: boolean) => {
      if (!providerId) {
        return;
      }

      setProviderDraft(providerId, (current) => {
        if (!current) {
          return current;
        }

        const apiKeyEntries = current.apiKeyEntries.map((entry) =>
          entry.id === id ? { ...entry, isEnabled } : entry,
        );

        return {
          ...current,
          apiKeyEntries,
          apiKeysInput: buildApiKeysInputFromEntries(apiKeyEntries),
        };
      });
    },
    [providerId],
  );

  const primaryBaseUrl =
    draft && draft.primaryEndpoint ? getBaseUrlForEndpoint(draft, draft.primaryEndpoint) : '';

  const resetEndpointDraft = useCallback(() => {
    if (!providerId || !provider) {
      return;
    }

    setProviderDraft(providerId, (current) =>
      current ? { ...current, ...createEndpointDraftSlice(provider) } : current,
    );
  }, [provider, providerId]);

  const syncEndpointDraft = useCallback((nextProvider: Provider) => {
    setProviderDraft(nextProvider.id, (current) =>
      current ? { ...current, ...createEndpointDraftSlice(nextProvider) } : current,
    );
  }, []);

  const resetApiKeysDraft = useCallback(() => {
    if (!providerId || apiKeys === undefined) {
      return;
    }

    setProviderDraft(providerId, (current) =>
      current ? { ...current, ...createApiKeysDraftSlice(apiKeys) } : current,
    );
  }, [apiKeys, providerId]);

  const syncApiKeysDraft = useCallback(
    (providerIdToSync: string, nextApiKeys: readonly ApiKeyEntry[]) => {
      setProviderDraft(providerIdToSync, (current) =>
        current ? { ...current, ...createApiKeysDraftSlice(nextApiKeys) } : current,
      );
    },
    [],
  );

  return {
    addApiKey,
    addEndpoint,
    draft,
    primaryBaseUrl,
    removeApiKey,
    removeEndpoint,
    resetApiKeysDraft,
    resetEndpointDraft,
    syncApiKeysDraft,
    syncEndpointDraft,
    updateApiKey,
    updateApiKeyEnabled,
    updateApiKeysInput,
    updateAuthDraft,
    updateEndpointBaseUrl,
  };
}

function createEndpointDraftSlice(
  provider: Provider,
): Pick<DraftSnapshot, 'baseUrlByEndpoint' | 'primaryEndpoint' | 'visibleEndpointTypes'> {
  const endpointConfigs = provider.endpointConfigs ?? {};
  const baseUrlByEndpoint = Object.fromEntries(
    Object.entries(endpointConfigs).map(([endpoint, config]) => [endpoint, config.baseUrl ?? '']),
  ) as DraftSnapshot['baseUrlByEndpoint'];
  const primaryEndpoint = getPrimaryEndpoint(provider);

  return {
    baseUrlByEndpoint: {
      ...baseUrlByEndpoint,
      [primaryEndpoint]: provider.endpointConfigs?.[primaryEndpoint]?.baseUrl ?? '',
    },
    primaryEndpoint,
    visibleEndpointTypes: resolveVisibleEndpointTypes(provider),
  };
}

function createApiKeysDraftSlice(
  apiKeys: readonly ApiKeyEntry[],
): Pick<DraftSnapshot, 'apiKeyEntries' | 'apiKeysInput'> {
  return {
    apiKeyEntries: apiKeys.map((entry) => ({ ...entry })),
    apiKeysInput: buildApiKeysInputFromEntries(apiKeys),
  };
}
