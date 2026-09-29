import { useAlert, useToast } from '@cherrystudio/ui/components';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule, useQuery } from '@/frontend/data';
import { useProviderAvatar, useProviderAvatarActions } from '@/frontend/hooks/useProviderAvatar';
import type { UpdateProviderInput } from '@/shared/data/api/schemas/providers';
import type { EndpointType } from '@/shared/data/types/model';
import type { ApiKeyEntry, Provider } from '@/shared/data/types/provider';

import { useProviderApiServiceQueries } from '../../../apiService/hooks/useProviderApiServiceQueries';
import {
  getApiKeyValidationError,
  normalizeApiKeyEntries,
} from '../../../apiService/utils/providerApiServiceApiKeys';
import {
  getEffectiveAuthConfig,
  shouldShowApiKeys,
} from '../../../apiService/utils/providerApiServiceAuth';
import {
  getPrimaryEndpoint,
  getProviderPrimaryBaseUrl,
  hasConfiguredCustomProviderTextEndpoint,
  isFullyCustomProvider,
} from '../../../apiService/utils/providerApiServiceEndpointRules';
import {
  buildProviderPrimaryBaseUrlUpdates,
  buildProviderTextEndpointUpdates,
  ProviderApiServiceSaveError,
} from '../../../apiService/utils/providerApiServiceSave';
import type { ProviderAddress, ProviderConfigurationValue } from '../types';
import {
  createProviderConfigurationValues,
  providerDefaultEndpointNeedsRepair,
  resolveProviderConfigurationEndpointTypes,
} from '../utils/providerConfigurationValues';

/**
 * A saved provider, edited one change at a time. Each action writes straight to the
 * provider record, so there is no draft, no Save button and nothing to discard.
 */
export function useSavedProviderConfiguration(providerId: string) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const accounts = useBackendModule('providers').accounts;
  const avatarUri = useProviderAvatar(providerId) ?? null;
  const providerAvatars = useProviderAvatarActions();
  const queries = useProviderApiServiceQueries(providerId);
  const { apiKeysQuery, authConfigQuery, providerQuery } = queries;
  const provider = queries.provider;
  const modelsQuery = useQuery('/models', { enabled: Boolean(providerId), query: { providerId } });
  const models = useMemo(() => modelsQuery.data ?? [], [modelsQuery.data]);
  const [pendingCount, setPendingCount] = useState(0);
  const [isAccountBusy, setIsAccountBusy] = useState(false);
  // Keys the user just changed, shown until the saved list catches up so a switch never flickers.
  const [optimisticApiKeys, setOptimisticApiKeys] = useState<ApiKeyEntry[] | null>(null);
  const savedApiKeys = queries.apiKeys;
  const apiKeys = optimisticApiKeys ?? savedApiKeys ?? [];
  const isLoading =
    providerQuery.isPending ||
    apiKeysQuery.isPending ||
    authConfigQuery.isPending ||
    modelsQuery.isPending;
  const isError =
    providerQuery.isError || apiKeysQuery.isError || authConfigQuery.isError || modelsQuery.isError;
  const isCustomProvider = isFullyCustomProvider(provider);
  const showApiKeys = shouldShowApiKeys(
    getEffectiveAuthConfig(queries.authConfig, provider).type,
    provider,
  );
  const requiresApiKey = showApiKeys && !provider?.authOptional;

  async function track<T>(work: () => Promise<T>): Promise<T> {
    setPendingCount((count) => count + 1);
    try {
      return await work();
    } finally {
      setPendingCount((count) => count - 1);
    }
  }

  async function save(updates: UpdateProviderInput): Promise<boolean> {
    try {
      await track(() => queries.saveProviderMutation.mutateAsync(updates));
      return true;
    } catch {
      toast.show({ label: t('settings.provider.apiService.saveFailed'), variant: 'danger' });
      return false;
    }
  }

  async function saveApiKeys(next: ApiKeyEntry[]): Promise<boolean> {
    if (next.some((entry) => getApiKeyValidationError(entry, next))) return false;
    const normalized = normalizeApiKeyEntries(next);
    setOptimisticApiKeys(normalized);
    try {
      return await save({ apiKeys: normalized });
    } finally {
      setOptimisticApiKeys(null);
    }
  }

  function showAddressError(error: unknown) {
    const missingEndpoint =
      error instanceof ProviderApiServiceSaveError && error.code === 'missing-text-endpoint';
    alert.show({
      description: t(
        missingEndpoint
          ? 'settings.provider.apiService.textEndpointRequired'
          : 'settings.provider.apiService.invalidBaseUrlMessage',
      ),
      title: t(
        missingEndpoint
          ? 'settings.provider.apiService.textEndpointsTitle'
          : 'settings.provider.apiService.invalidBaseUrlTitle',
      ),
    });
  }

  /** Writes custom endpoints after the checks that protect models already using them. */
  async function saveCustomEndpoints(
    current: Provider,
    endpointUrls: Partial<Record<EndpointType, string>>,
    defaultChatEndpoint: EndpointType,
  ): Promise<boolean> {
    let updates: ReturnType<typeof buildProviderTextEndpointUpdates>;
    try {
      updates = buildProviderTextEndpointUpdates({
        defaultChatEndpoint,
        endpointUrls,
        provider: current,
      });
    } catch (error) {
      showAddressError(error);
      return false;
    }
    const removedEndpoints = Object.keys(current.endpointConfigs ?? {}).filter(
      (type) =>
        current.endpointConfigs?.[type as EndpointType]?.baseUrl?.trim() &&
        !updates.endpointConfigs[type as EndpointType]?.baseUrl?.trim(),
    );
    const referencedCount = models.filter((model) =>
      removedEndpoints.includes(model.endpointTypes?.[0] ?? ''),
    ).length;
    if (referencedCount > 0) {
      alert.show({
        description: t('settings.provider.apiService.endpointInUseMessage', {
          count: referencedCount,
        }),
        title: t('settings.provider.apiService.endpointInUseTitle'),
      });
      return false;
    }
    const followingModelCount = models.filter((model) => !model.endpointTypes?.[0]).length;
    if (current.defaultChatEndpoint !== updates.defaultChatEndpoint && followingModelCount > 0) {
      // Models that follow the default move with it, so the user confirms before anything is written.
      alert.confirm({
        confirmLabel: t('common.save'),
        description: t('settings.provider.apiService.defaultEndpointChangeMessage', {
          count: followingModelCount,
        }),
        onConfirm: () => void save(updates),
        title: t('settings.provider.apiService.defaultEndpointChangeTitle'),
      });
      return true;
    }
    return save(updates);
  }

  const customEndpointUrls =
    provider && isCustomProvider
      ? createProviderConfigurationValues({ avatarUri, provider }).endpointUrls
      : {};

  // A custom provider whose default protocol lost its address is repaired once, the way
  // saving the old form did, so requests never resolve to a missing endpoint.
  const repairedProviderId = useRef<string | null>(null);
  const repairKey =
    provider && providerDefaultEndpointNeedsRepair(provider) && !isLoading ? provider.id : null;
  useEffect(() => {
    if (!provider || !repairKey || repairedProviderId.current === repairKey) return;
    repairedProviderId.current = repairKey;
    const { defaultChatEndpoint, endpointUrls } = createProviderConfigurationValues({
      avatarUri: null,
      provider,
    });
    if (!hasConfiguredCustomProviderTextEndpoint(endpointUrls)) return;
    void queries.saveProviderMutation
      .mutateAsync(
        buildProviderTextEndpointUpdates({ defaultChatEndpoint, endpointUrls, provider }),
      )
      .catch(() => undefined);
  }, [provider, queries.saveProviderMutation, repairKey]);

  const address: ProviderAddress = !provider
    ? { kind: 'none' }
    : isCustomProvider
      ? {
          defaultChatEndpoint: createProviderConfigurationValues({ avatarUri, provider })
            .defaultChatEndpoint,
          endpointUrls: customEndpointUrls,
          kind: 'custom',
        }
      : resolveProviderConfigurationEndpointTypes(provider).length > 0
        ? {
            baseUrl: getProviderPrimaryBaseUrl(provider),
            endpoint: getPrimaryEndpoint(provider),
            kind: 'primary',
          }
        : { kind: 'none' };

  const value: ProviderConfigurationValue | undefined = provider
    ? {
        account: accounts.getCapabilities(provider).signIn
          ? {
              capabilities: accounts.getCapabilities(provider),
              onBusyChange: setIsAccountBusy,
              onKeysChanged: async () => {
                await apiKeysQuery.refetch({ throwOnError: true });
              },
            }
          : undefined,
        actions: {
          addApiKey: (entry) => saveApiKeys([...apiKeys, entry]),
          removeApiKey: (id) => saveApiKeys(apiKeys.filter((entry) => entry.id !== id)),
          rename: async (name) => {
            const trimmed = name.trim();
            if (!trimmed || trimmed === provider.name) return Boolean(trimmed);
            return save({ name: trimmed });
          },
          setAvatar: async (uri) => {
            try {
              await track(async () => {
                if (uri) await providerAvatars.persist(providerId, uri);
                else providerAvatars.remove(providerId);
              });
              return true;
            } catch {
              toast.show({
                label: t('settings.provider.apiService.saveFailed'),
                variant: 'danger',
              });
              return false;
            }
          },
          setBaseUrl: async (baseUrl) => {
            try {
              return await save(buildProviderPrimaryBaseUrlUpdates({ baseUrl, provider }));
            } catch (error) {
              showAddressError(error);
              return false;
            }
          },
          setDefaultEndpoint: (endpoint) =>
            saveCustomEndpoints(provider, customEndpointUrls, endpoint),
          setEndpointUrl: (endpoint, baseUrl) =>
            saveCustomEndpoints(
              provider,
              { ...customEndpointUrls, [endpoint]: baseUrl },
              address.kind === 'custom'
                ? address.defaultChatEndpoint
                : getPrimaryEndpoint(provider),
            ),
          updateApiKey: (id, updates) =>
            saveApiKeys(
              apiKeys.map((entry) => (entry.id === id ? { ...entry, ...updates } : entry)),
            ),
        },
        address,
        apiKeys: showApiKeys ? apiKeys : null,
        apiKeyUrl: provider.websites?.apiKey ?? provider.websites?.official,
        avatarUri,
        isBusy: pendingCount > 0 || isAccountBusy,
        models,
        name: provider.name,
        presetProviderId: provider.presetProviderId,
        provider,
        providerId,
        status: provider.isEnabled
          ? t('settings.provider.config.statusEnabled', { count: models.length })
          : t('settings.provider.status.disabled'),
      }
    : undefined;

  const hasUsableKey = apiKeys.some((entry) => entry.isEnabled && entry.key.trim());
  const hasAddress =
    address.kind === 'custom'
      ? hasConfiguredCustomProviderTextEndpoint(address.endpointUrls)
      : address.kind === 'primary'
        ? address.baseUrl.trim().length > 0
        : true;
  const allKeysDisabled = apiKeys.length > 0 && !apiKeys.some((entry) => entry.isEnabled);
  const continueHint =
    requiresApiKey && allKeysDisabled
      ? t('settings.provider.setup.issues.disabled-api-keys')
      : requiresApiKey && !hasUsableKey
        ? t('settings.provider.setup.issues.missing-api-key')
        : !hasAddress
          ? t('settings.provider.setup.issues.invalid-endpoint')
          : undefined;

  return {
    canContinue: Boolean(value) && !isLoading && !isError && continueHint === undefined,
    continueHint,
    isError,
    isLoading,
    provider,
    providerQuery,
    value: isLoading ? undefined : value,
  };
}
