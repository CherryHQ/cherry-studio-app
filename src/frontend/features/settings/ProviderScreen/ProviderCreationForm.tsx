import { Button, useAlert } from '@cherrystudio/ui/components';
import * as Crypto from 'expo-crypto';
import { type ReactElement, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { useMutation } from '@/frontend/data';
import { keyboardBottomOffset } from '@/frontend/utils/constants';
import type { UpdateProviderInput } from '@/shared/data/api/schemas/providers';

import { useProviderAvatar, useProviderAvatarActions } from '../components/providerAvatarStore';
import {
  buildApiKeyEntriesFromInput,
  buildApiKeysInputFromEntries,
  buildProviderPrimaryBaseUrlUpdates,
  getEffectiveAuthConfig,
  normalizeApiKeyEntries,
  ProviderApiServiceSaveError,
  shouldShowApiKeys,
  useProviderApiServiceQueries,
} from './apiService';
import {
  buildCustomProviderCreationPayload,
  findInvalidCustomProviderEndpointUrl,
} from './apiService/utils/providerApiServiceEndpointRules';
import {
  createEmptyProviderFormValues,
  createProviderFormValues,
  NEW_PROVIDER_ENDPOINT_TYPES,
  ProviderForm,
  type ProviderFormValue,
  type ProviderFormValues,
  resolveProviderFormEndpointTypes,
  useProviderFormDraft,
} from './providerForm';

export function useNewProviderForm() {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const providerAvatars = useProviderAvatarActions();
  const createProviderMutation = useMutation('POST', '/providers', {
    refresh: ['/providers', '/providers/page'],
  });
  const createProvider = createProviderMutation.trigger;
  const isCreating = createProviderMutation.isLoading;
  const form = useProviderFormDraft({
    createInitialValues: createEmptyProviderFormValues,
    endpointTypes: NEW_PROVIDER_ENDPOINT_TYPES,
    isSubmitting: isCreating,
    sourceKey: 'new-provider',
  });
  const { meta, state } = form;
  const baseUrl = meta.baseUrlEndpoint ? (state.endpointUrls[meta.baseUrlEndpoint] ?? '') : '';

  const submitProvider = useCallback(
    async (values: ProviderFormValues) => {
      const providerId = Crypto.randomUUID();
      const { defaultChatEndpoint, endpointConfigs } = buildCustomProviderCreationPayload({
        endpointUrls: values.endpointUrls,
        preferredChatEndpoint: values.defaultChatEndpoint,
      });
      const apiKeys = buildApiKeyEntriesFromInput(values.apiKey, []);

      await createProvider({
        body: {
          apiKeys: apiKeys.length > 0 ? apiKeys : undefined,
          authConfig: { type: 'api-key' },
          defaultChatEndpoint,
          endpointConfigs,
          name: values.name.trim(),
          providerId,
        },
      });

      if (values.avatarUri) {
        await providerAvatars.persist(providerId, values.avatarUri);
      }

      return providerId;
    },
    [createProvider, providerAvatars],
  );
  const canSubmit = meta.canSubmit && baseUrl.trim().length > 0 && state.apiKey.trim().length > 0;
  const handleSave = useCallback(async () => {
    if (!canSubmit) {
      return undefined;
    }

    if (findInvalidCustomProviderEndpointUrl(state.endpointUrls)) {
      alert.show({
        description: t('settings.provider.apiService.invalidBaseUrlMessage'),
        title: t('settings.provider.apiService.invalidBaseUrlTitle'),
      });
      return undefined;
    }

    Keyboard.dismiss();
    const providerName = state.name.trim();
    try {
      const providerId = await submitProvider(state);
      return { providerId, providerName };
    } catch {
      alert.show({ title: t('settings.provider.add.error') });
      return undefined;
    }
  }, [alert, canSubmit, state, submitProvider, t]);

  return { canSubmit, form, handleSave, isCreating };
}

export function useImportedProviderForm(providerId: string) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const providerAvatars = useProviderAvatarActions();
  const storedAvatarUri = useProviderAvatar(providerId);
  const {
    apiKeys,
    apiKeysQuery,
    authConfig,
    authConfigQuery,
    isSaving,
    provider,
    providerQuery,
    replaceApiKeysMutation,
    saveProviderMutation,
  } = useProviderApiServiceQueries(providerId);
  const endpointTypes = useMemo(
    () => (provider ? resolveProviderFormEndpointTypes(provider) : []),
    [provider],
  );
  const apiKeysInput = useMemo(
    () => buildApiKeysInputFromEntries(normalizeApiKeyEntries(apiKeys ?? [])),
    [apiKeys],
  );
  const isLoading = providerQuery.isPending || apiKeysQuery.isPending || authConfigQuery.isPending;
  const createInitialValues = useCallback(
    () =>
      provider
        ? createProviderFormValues({
            apiKey: apiKeysInput,
            avatarUri: storedAvatarUri ?? null,
            provider,
          })
        : createEmptyProviderFormValues(),
    [apiKeysInput, provider, storedAvatarUri],
  );
  const form = useProviderFormDraft({
    createInitialValues,
    endpointTypes,
    isSubmitting: isSaving,
    sourceKey: !isLoading && provider ? provider.id : '',
  });
  const showApiKey = shouldShowApiKeys(getEffectiveAuthConfig(authConfig, provider).type, provider);
  const baseUrlEndpoint = form.meta.baseUrlEndpoint;
  const baseUrl = baseUrlEndpoint ? (form.state.endpointUrls[baseUrlEndpoint] ?? '') : '';
  const requiresApiKey = showApiKey && !provider?.authOptional;
  const canSubmit =
    Boolean(provider) &&
    form.meta.canSubmit &&
    (!baseUrlEndpoint || baseUrl.trim().length > 0) &&
    (!requiresApiKey || form.state.apiKey.trim().length > 0);
  const handleSave = useCallback(async () => {
    if (!provider || !canSubmit) {
      return undefined;
    }

    const providerName = form.state.name.trim();
    let updates: UpdateProviderInput = { name: providerName };

    if (baseUrlEndpoint) {
      try {
        updates = {
          ...updates,
          ...buildProviderPrimaryBaseUrlUpdates({
            baseUrl,
            provider,
          }),
        };
      } catch (error) {
        alert.show(
          error instanceof ProviderApiServiceSaveError
            ? {
                description: t('settings.provider.apiService.invalidBaseUrlMessage'),
                title: t('settings.provider.apiService.invalidBaseUrlTitle'),
              }
            : { title: t('settings.provider.apiService.saveFailed') },
        );
        return undefined;
      }
    }

    const nextApiKeys = buildApiKeyEntriesFromInput(form.state.apiKey, apiKeys ?? []);
    const shouldSaveApiKeys = showApiKey && form.state.apiKey !== apiKeysInput;

    Keyboard.dismiss();
    try {
      await Promise.all([
        saveProviderMutation.mutateAsync(updates),
        shouldSaveApiKeys ? replaceApiKeysMutation.mutateAsync(nextApiKeys) : Promise.resolve(),
      ]);

      if (form.state.avatarUri !== (storedAvatarUri ?? null)) {
        if (form.state.avatarUri) {
          await providerAvatars.persist(providerId, form.state.avatarUri);
        } else {
          providerAvatars.remove(providerId);
        }
      }

      return { providerId, providerName };
    } catch {
      alert.show({ title: t('settings.provider.apiService.saveFailed') });
      return undefined;
    }
  }, [
    alert,
    apiKeys,
    apiKeysInput,
    baseUrl,
    baseUrlEndpoint,
    canSubmit,
    form.state,
    provider,
    providerAvatars,
    providerId,
    replaceApiKeysMutation,
    saveProviderMutation,
    showApiKey,
    storedAvatarUri,
    t,
  ]);

  return {
    canSubmit,
    form,
    handleSave,
    isError: providerQuery.isError || apiKeysQuery.isError || authConfigQuery.isError,
    isLoading,
    isSaving,
    provider,
    showApiKey,
  };
}

export function ProviderNewFormContent({
  avatar,
  canSave,
  form,
  isSaving,
  onSave,
  showApiKey = true,
}: {
  avatar?: ReactElement;
  canSave: boolean;
  form: ProviderFormValue;
  isSaving: boolean;
  onSave: () => void;
  showApiKey?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <KeyboardAwareScrollView
      alwaysBounceVertical={false}
      bottomOffset={keyboardBottomOffset}
      className="flex-1"
      contentInsetAdjustmentBehavior="automatic"
      disableScrollOnKeyboardHide
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      mode="layout"
      showsVerticalScrollIndicator={false}
    >
      <ProviderForm value={form}>
        <ProviderForm.Avatar>{avatar}</ProviderForm.Avatar>
        <ProviderForm.Name />
        <ProviderForm.BaseUrl />
        {showApiKey ? <ProviderForm.ApiKey /> : null}
      </ProviderForm>
      <View className="px-4 pb-8">
        <Button disabled={!canSave} loading={isSaving} onPress={onSave} size="lg">
          {t(isSaving ? 'settings.provider.setup.preparing' : 'settings.provider.setup.next')}
        </Button>
      </View>
    </KeyboardAwareScrollView>
  );
}
