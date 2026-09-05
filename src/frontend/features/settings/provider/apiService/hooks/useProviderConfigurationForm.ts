import { useAlert, useToast } from '@cherrystudio/ui/components';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard } from 'react-native';

import { useQuery } from '@/frontend/data';
import type { UpdateProviderInput } from '@/shared/data/api/schemas/providers';

import {
  createEmptyProviderFormValues,
  createProviderFormValues,
  providerDefaultEndpointNeedsRepair,
  resolveProviderFormEndpointTypes,
  useProviderFormDraft,
} from '../../components/ProviderForm';
import { useProviderAvatar, useProviderAvatarActions } from '../../hooks/useProviderAvatar';
import {
  buildApiKeyEntriesFromInput,
  buildApiKeysInputFromEntries,
  normalizeApiKeyEntries,
} from '../utils/providerApiServiceApiKeys';
import { getEffectiveAuthConfig, shouldShowApiKeys } from '../utils/providerApiServiceAuth';
import {
  CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPES,
  findInvalidCustomProviderEndpointUrl,
  hasConfiguredCustomProviderTextEndpoint,
  isFullyCustomProvider,
} from '../utils/providerApiServiceEndpointRules';
import {
  buildProviderPrimaryBaseUrlUpdates,
  buildProviderTextEndpointUpdates,
  ProviderApiServiceSaveError,
} from '../utils/providerApiServiceSave';
import { useProviderApiServiceQueries } from './useProviderApiServiceQueries';

type SavedProviderConfiguration = { providerId: string; providerName: string };

/** Owns the persisted-provider draft and save rules shared by editing and setup. */
export function useProviderConfigurationForm(providerId: string) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const providerAvatars = useProviderAvatarActions();
  const storedAvatarUri = useProviderAvatar(providerId);
  const queries = useProviderApiServiceQueries(providerId);
  const { apiKeys, apiKeysQuery, authConfig, authConfigQuery, provider, providerQuery } = queries;
  const modelsQuery = useQuery('/models', { enabled: Boolean(providerId), query: { providerId } });
  const isCustomProvider = isFullyCustomProvider(provider);
  const [isPersisting, setIsPersisting] = useState(false);
  const savePending = useRef(false);
  const isSaving = isPersisting || queries.isSaving;
  const isLoading =
    providerQuery.isPending ||
    apiKeysQuery.isPending ||
    authConfigQuery.isPending ||
    modelsQuery.isPending;
  const isError =
    providerQuery.isError || apiKeysQuery.isError || authConfigQuery.isError || modelsQuery.isError;
  const endpointTypes = provider ? resolveProviderFormEndpointTypes(provider) : [];
  const apiKeysInput = buildApiKeysInputFromEntries(normalizeApiKeyEntries(apiKeys ?? []));
  const defaultEndpointNeedsRepair = provider
    ? providerDefaultEndpointNeedsRepair(provider)
    : false;
  const createInitialValues = () =>
    provider
      ? createProviderFormValues({
          apiKey: apiKeysInput,
          avatarUri: storedAvatarUri ?? null,
          provider,
        })
      : createEmptyProviderFormValues();
  const form = useProviderFormDraft({
    createInitialValues,
    defaultEndpointNeedsRepair,
    endpointTypes,
    initiallyDirty: defaultEndpointNeedsRepair,
    isSubmitting: isSaving,
    normalizeCustomEndpoints: isCustomProvider,
    sourceKey: !isLoading && provider ? provider.id : '',
  });
  const { state, meta } = form;
  const showApiKey = shouldShowApiKeys(getEffectiveAuthConfig(authConfig, provider).type, provider);
  const requiresApiKey = showApiKey && !provider?.authOptional;
  const disabledKeys = Boolean(apiKeys?.length) && !apiKeys?.some((key) => key.isEnabled);
  const baseUrlEndpoint = meta.baseUrlEndpoint;
  const baseUrl = baseUrlEndpoint ? (state.endpointUrls[baseUrlEndpoint] ?? '') : '';
  const canSubmit =
    Boolean(provider) &&
    !isLoading &&
    !isError &&
    meta.canSubmit &&
    (!isCustomProvider ||
      (hasConfiguredCustomProviderTextEndpoint(state.endpointUrls) &&
        !findInvalidCustomProviderEndpointUrl(state.endpointUrls)));
  const canCompleteSetup =
    canSubmit &&
    (!baseUrlEndpoint || baseUrl.trim().length > 0 || isCustomProvider) &&
    (!requiresApiKey ||
      buildApiKeyEntriesFromInput(state.apiKey, apiKeys ?? []).some(
        (key) => key.isEnabled && key.key.trim(),
      ));

  function enableKeys() {
    if (isSaving) return;
    void queries.replaceApiKeysMutation
      .mutateAsync((apiKeys ?? []).map((key) => ({ ...key, isEnabled: true })))
      .catch(() =>
        toast.show({ label: t('settings.provider.apiService.saveFailed'), variant: 'danger' }),
      );
  }

  function requestSave(onSaved?: (result: SavedProviderConfiguration) => void) {
    if (!provider || !canSubmit || savePending.current) return;
    const providerName = state.name.trim();
    let updates: UpdateProviderInput = { name: providerName };
    let savedEndpointUrls = state.endpointUrls;
    try {
      if (isCustomProvider) {
        updates = {
          ...updates,
          ...buildProviderTextEndpointUpdates({
            defaultChatEndpoint: state.defaultChatEndpoint,
            endpointUrls: state.endpointUrls,
            provider,
          }),
        };
        savedEndpointUrls = Object.fromEntries(
          CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPES.map((type) => [
            type,
            state.endpointUrls[type]?.trim() ?? '',
          ]),
        );
      } else if (baseUrlEndpoint) {
        updates = { ...updates, ...buildProviderPrimaryBaseUrlUpdates({ baseUrl, provider }) };
        savedEndpointUrls = { ...state.endpointUrls, [baseUrlEndpoint]: baseUrl.trim() };
      }
    } catch (error) {
      const missingEndpoint =
        error instanceof ProviderApiServiceSaveError && error.code === 'missing-text-endpoint';
      alert.show({
        title: t(
          missingEndpoint
            ? 'settings.provider.apiService.textEndpointsTitle'
            : 'settings.provider.apiService.invalidBaseUrlTitle',
        ),
        description: t(
          missingEndpoint
            ? 'settings.provider.apiService.textEndpointRequired'
            : 'settings.provider.apiService.invalidBaseUrlMessage',
        ),
      });
      return;
    }

    const models = modelsQuery.data ?? [];
    const removedEndpoints = isCustomProvider
      ? CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPES.filter(
          (type) =>
            provider.endpointConfigs?.[type]?.baseUrl?.trim() &&
            !updates.endpointConfigs?.[type]?.baseUrl?.trim(),
        )
      : [];
    const referencedCount = models.filter((model) =>
      removedEndpoints.some((type) => type === model.endpointTypes?.[0]),
    ).length;
    if (referencedCount > 0) {
      alert.show({
        title: t('settings.provider.apiService.endpointInUseTitle'),
        description: t('settings.provider.apiService.endpointInUseMessage', {
          count: referencedCount,
        }),
      });
      return;
    }

    const nextApiKeys = buildApiKeyEntriesFromInput(state.apiKey, apiKeys ?? []);
    const shouldSaveApiKeys = showApiKey && state.apiKey !== apiKeysInput;
    const persist = () => {
      if (savePending.current) return;
      savePending.current = true;
      setIsPersisting(true);
      Keyboard.dismiss();
      void Promise.all([
        queries.saveProviderMutation.mutateAsync(updates),
        shouldSaveApiKeys
          ? queries.replaceApiKeysMutation.mutateAsync(nextApiKeys)
          : Promise.resolve(),
      ])
        .then(async () => {
          if (state.avatarUri !== (storedAvatarUri ?? null)) {
            if (state.avatarUri) await providerAvatars.persist(providerId, state.avatarUri);
            else providerAvatars.remove(providerId);
          }
          form.actions.reset({
            ...state,
            apiKey: shouldSaveApiKeys ? buildApiKeysInputFromEntries(nextApiKeys) : state.apiKey,
            defaultChatEndpoint: updates.defaultChatEndpoint ?? state.defaultChatEndpoint,
            endpointUrls: savedEndpointUrls,
            name: providerName,
          });
          onSaved?.({ providerId, providerName });
        })
        .catch(() => {
          toast.show({ label: t('settings.provider.apiService.saveFailed'), variant: 'danger' });
        })
        .finally(() => {
          savePending.current = false;
          setIsPersisting(false);
        });
    };
    const followingModelCount = models.filter((model) => !model.endpointTypes?.[0]).length;
    if (
      isCustomProvider &&
      provider.defaultChatEndpoint !== updates.defaultChatEndpoint &&
      followingModelCount > 0
    ) {
      alert.confirm({
        title: t('settings.provider.apiService.defaultEndpointChangeTitle'),
        description: t('settings.provider.apiService.defaultEndpointChangeMessage', {
          count: followingModelCount,
        }),
        confirmLabel: t('common.save'),
        onConfirm: persist,
      });
    } else {
      persist();
    }
  }

  return {
    apiKeys,
    canCompleteSetup,
    canSubmit,
    createInitialValues,
    disabledKeys,
    enableKeys,
    form,
    isCustomProvider,
    isError,
    isLoading,
    isSaving,
    modelsQuery,
    provider,
    providerQuery,
    requestSave,
    requiresApiKey,
    showApiKey,
  };
}
