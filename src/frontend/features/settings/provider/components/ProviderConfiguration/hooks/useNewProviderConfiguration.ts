import { useToast } from '@cherrystudio/ui/components';
import * as Crypto from 'expo-crypto';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard } from 'react-native';

import { useMutation } from '@/frontend/data';
import { useProviderAvatarActions } from '@/frontend/hooks/useProviderAvatar';

import {
  getApiKeyValidationError,
  normalizeApiKeyEntries,
} from '../../../apiService/utils/providerApiServiceApiKeys';
import {
  buildCustomProviderCreationPayload,
  findInvalidCustomProviderEndpointUrl,
  hasConfiguredCustomProviderTextEndpoint,
} from '../../../apiService/utils/providerApiServiceEndpointRules';
import type { ProviderConfigurationValue } from '../types';
import {
  createEmptyProviderConfigurationValues,
  NEW_PROVIDER_ENDPOINT_TYPES,
} from '../utils/providerConfigurationValues';
import { useProviderConfigurationDraft } from './useProviderConfigurationDraft';

// The draft has no record yet; the id is only a stable key for its avatar and rows.
const NEW_PROVIDER_KEY = 'new-provider';

/**
 * A custom provider that does not exist until the user continues. It exposes the same
 * value as a saved provider, so the configuration screen cannot tell them apart.
 */
export function useNewProviderConfiguration() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const providerAvatars = useProviderAvatarActions();
  const createProviderMutation = useMutation('POST', '/providers', {
    refresh: ['/providers', '/providers/page'],
  });
  const [isCreating, setIsCreating] = useState(false);
  const draft = useProviderConfigurationDraft({
    createInitialValues: createEmptyProviderConfigurationValues,
    endpointTypes: NEW_PROVIDER_ENDPOINT_TYPES,
    isSubmitting: isCreating,
    normalizeCustomEndpoints: true,
    sourceKey: NEW_PROVIDER_KEY,
  });
  const { actions, meta, state } = draft;

  const value: ProviderConfigurationValue = {
    actions: {
      addApiKey: async (entry) => {
        const next = [...state.apiKeys, entry];
        if (getApiKeyValidationError(entry, next)) return false;
        actions.addApiKey(entry);
        return true;
      },
      removeApiKey: async (id) => {
        actions.removeApiKey(id);
        return true;
      },
      rename: async (name) => {
        actions.setName(name.trim());
        return true;
      },
      setAvatar: async (uri) => {
        actions.setAvatarUri(uri);
        return true;
      },
      // A custom provider always edits protocol addresses, never a single base URL.
      setBaseUrl: async () => false,
      setDefaultEndpoint: async (endpoint) => {
        actions.setDefaultChatEndpoint(endpoint);
        return true;
      },
      setEndpointUrl: async (endpoint, baseUrl) => {
        actions.setEndpointUrl(endpoint, baseUrl.trim());
        return true;
      },
      updateApiKey: async (id, updates) => {
        actions.updateApiKey(id, updates);
        return true;
      },
    },
    address: {
      defaultChatEndpoint: state.defaultChatEndpoint,
      endpointUrls: state.endpointUrls,
      kind: 'custom',
    },
    apiKeys: state.apiKeys,
    avatarUri: state.avatarUri,
    isBusy: isCreating,
    name: state.name,
    providerId: NEW_PROVIDER_KEY,
  };

  const hasName = state.name.trim().length > 0;
  const hasUsableKey = state.apiKeys.some((entry) => entry.isEnabled && entry.key.trim());
  const hasAddress =
    hasConfiguredCustomProviderTextEndpoint(state.endpointUrls) &&
    !findInvalidCustomProviderEndpointUrl(state.endpointUrls);
  const continueHint = !hasName
    ? t('settings.provider.config.nameRequired')
    : !hasUsableKey
      ? t('settings.provider.setup.issues.missing-api-key')
      : !hasAddress
        ? t('settings.provider.apiService.textEndpointRequired')
        : undefined;

  async function create(): Promise<{ providerId: string; providerName: string } | undefined> {
    if (continueHint !== undefined || isCreating || !meta.canSubmit) return undefined;
    Keyboard.dismiss();
    setIsCreating(true);
    const providerId = Crypto.randomUUID();
    const providerName = state.name.trim();
    try {
      const { defaultChatEndpoint, endpointConfigs } = buildCustomProviderCreationPayload({
        endpointUrls: state.endpointUrls,
        preferredChatEndpoint: state.defaultChatEndpoint,
      });
      const apiKeys = normalizeApiKeyEntries(state.apiKeys);
      await createProviderMutation.trigger({
        body: {
          apiKeys: apiKeys.length > 0 ? apiKeys : undefined,
          authConfig: { type: 'api-key' },
          defaultChatEndpoint,
          endpointConfigs,
          name: providerName,
          providerId,
        },
      });
      if (state.avatarUri) await providerAvatars.persist(providerId, state.avatarUri);
      return { providerId, providerName };
    } catch {
      toast.show({ label: t('settings.provider.add.error'), variant: 'danger' });
      return undefined;
    } finally {
      setIsCreating(false);
    }
  }

  return {
    canContinue: continueHint === undefined && meta.canSubmit,
    continueHint,
    create,
    isCreating,
    isDirty: meta.isDirty,
    value,
  };
}
