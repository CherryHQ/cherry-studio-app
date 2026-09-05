import { Button, useAlert, useToast } from '@cherrystudio/ui/components';
import * as Crypto from 'expo-crypto';
import { type ReactElement, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { useMutation, useQuery } from '@/frontend/data';
import { keyboardBottomOffset } from '@/frontend/utils/constants';
import type { ProviderConfigurationIssue } from '@/shared/contracts';
import type { UpdateProviderInput } from '@/shared/data/api/schemas/providers';

import {
  buildApiKeyEntriesFromInput,
  buildApiKeysInputFromEntries,
  buildProviderPrimaryBaseUrlUpdates,
  buildProviderTextEndpointUpdates,
  isFullyCustomProvider,
  getEffectiveAuthConfig,
  normalizeApiKeyEntries,
  ProviderApiServiceSaveError,
  shouldShowApiKeys,
  useProviderApiServiceQueries,
} from '../../apiService';
import {
  buildCustomProviderCreationPayload,
  CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPES,
  findInvalidCustomProviderEndpointUrl,
  hasConfiguredCustomProviderTextEndpoint,
} from '../../apiService/utils/providerApiServiceEndpointRules';
import {
  createEmptyProviderFormValues,
  createProviderFormValues,
  NEW_PROVIDER_ENDPOINT_TYPES,
  ProviderForm,
  type ProviderFormValue,
  type ProviderFormValues,
  resolveProviderFormEndpointTypes,
  useProviderFormDraft,
} from '../../components/ProviderForm';
import { useProviderAvatar, useProviderAvatarActions } from '../../hooks/useProviderAvatar';

export function useNewProviderForm() {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
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
    normalizeCustomEndpoints: true,
    sourceKey: 'new-provider',
  });
  const { meta, state } = form;

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
  const canSubmit =
    meta.canSubmit &&
    hasConfiguredCustomProviderTextEndpoint(state.endpointUrls) &&
    !findInvalidCustomProviderEndpointUrl(state.endpointUrls) &&
    state.apiKey.trim().length > 0;
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
      toast.show({ label: t('settings.provider.add.error'), variant: 'danger' });
      return undefined;
    }
  }, [alert, canSubmit, state, submitProvider, t, toast]);

  return { canSubmit, form, handleSave, isCreating };
}

export function useImportedProviderForm(providerId: string) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
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
  const isCustomProvider = isFullyCustomProvider(provider);
  const modelsQuery = useQuery('/models', {
    enabled: isCustomProvider,
    query: { providerId },
  });
  const endpointTypes = useMemo(
    () => (provider ? resolveProviderFormEndpointTypes(provider) : []),
    [provider],
  );
  const apiKeysInput = useMemo(
    () => buildApiKeysInputFromEntries(normalizeApiKeyEntries(apiKeys ?? [])),
    [apiKeys],
  );
  const isLoading =
    providerQuery.isPending ||
    apiKeysQuery.isPending ||
    authConfigQuery.isPending ||
    (isCustomProvider && modelsQuery.isPending);
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
    normalizeCustomEndpoints: isCustomProvider,
    sourceKey: !isLoading && provider ? provider.id : '',
  });
  const showApiKey = shouldShowApiKeys(getEffectiveAuthConfig(authConfig, provider).type, provider);
  const baseUrlEndpoint = form.meta.baseUrlEndpoint;
  const baseUrl = baseUrlEndpoint ? (form.state.endpointUrls[baseUrlEndpoint] ?? '') : '';
  const requiresApiKey = showApiKey && !provider?.authOptional;
  const disabledKeys = Boolean(apiKeys?.length) && !apiKeys?.some((key) => key.isEnabled);
  const enableKeys = () => {
    void replaceApiKeysMutation
      .mutateAsync((apiKeys ?? []).map((key) => ({ ...key, isEnabled: true })))
      .catch(() =>
        toast.show({ label: t('settings.provider.apiService.saveFailed'), variant: 'danger' }),
      );
  };
  const canSubmit =
    Boolean(provider) &&
    (!isCustomProvider || modelsQuery.isSuccess) &&
    form.meta.canSubmit &&
    (!baseUrlEndpoint || baseUrl.trim().length > 0 || isCustomProvider) &&
    (!isCustomProvider ||
      (hasConfiguredCustomProviderTextEndpoint(form.state.endpointUrls) &&
        !findInvalidCustomProviderEndpointUrl(form.state.endpointUrls))) &&
    (!requiresApiKey ||
      buildApiKeyEntriesFromInput(form.state.apiKey, apiKeys ?? []).some(
        (key) => key.isEnabled && key.key.trim(),
      ));
  const handleSave = useCallback(async () => {
    if (!provider || !canSubmit) {
      return undefined;
    }

    const providerName = form.state.name.trim();
    let updates: UpdateProviderInput = { name: providerName };

    if (isCustomProvider || baseUrlEndpoint) {
      try {
        updates = {
          ...updates,
          ...(isCustomProvider
            ? buildProviderTextEndpointUpdates({
                provider,
                endpointUrls: form.state.endpointUrls,
                defaultChatEndpoint: form.state.defaultChatEndpoint,
              })
            : buildProviderPrimaryBaseUrlUpdates({ baseUrl, provider })),
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

    if (isCustomProvider) {
      const removedEndpoints = CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPES.filter(
        (type) =>
          provider.endpointConfigs?.[type]?.baseUrl?.trim() &&
          !updates.endpointConfigs?.[type]?.baseUrl?.trim(),
      );
      const referencedCount = (modelsQuery.data ?? []).filter((model) =>
        removedEndpoints.some((type) => type === model.endpointTypes?.[0]),
      ).length;
      if (referencedCount > 0) {
        alert.show({
          title: t('settings.provider.apiService.endpointInUseTitle'),
          description: t('settings.provider.apiService.endpointInUseMessage', {
            count: referencedCount,
          }),
        });
        return undefined;
      }
    }

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

      form.actions.reset(form.state);
      return { providerId, providerName };
    } catch {
      toast.show({ label: t('settings.provider.apiService.saveFailed'), variant: 'danger' });
      return undefined;
    }
  }, [
    alert,
    apiKeys,
    apiKeysInput,
    baseUrl,
    baseUrlEndpoint,
    canSubmit,
    form,
    isCustomProvider,
    modelsQuery.data,
    provider,
    providerAvatars,
    providerId,
    replaceApiKeysMutation,
    saveProviderMutation,
    showApiKey,
    storedAvatarUri,
    t,
    toast,
  ]);

  return {
    canSubmit,
    disabledKeys,
    enableKeys,
    isCustomProvider,
    form,
    handleSave,
    isError:
      providerQuery.isError ||
      apiKeysQuery.isError ||
      authConfigQuery.isError ||
      (isCustomProvider && modelsQuery.isError),
    isLoading,
    isSaving,
    provider,
    showApiKey,
    requiresApiKey,
  };
}

export function ProviderNewFormContent({
  avatar,
  canSave,
  endpointMode = 'primary',
  form,
  isSaving,
  onSave,
  showApiKey = true,
  issue,
  disabledKeys = false,
  onEnableKeys,
}: {
  avatar?: ReactElement;
  canSave: boolean;
  endpointMode?: 'custom-text' | 'primary';
  form: ProviderFormValue;
  isSaving: boolean;
  onSave: () => void;
  showApiKey?: boolean;
  issue?: ProviderConfigurationIssue;
  disabledKeys?: boolean;
  onEnableKeys?: () => void;
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
      {issue || disabledKeys ? (
        <View className="gap-3 px-4 py-3">
          <Text className="text-foreground-secondary text-sm">
            {t(`settings.provider.setup.issues.${disabledKeys ? 'disabled-api-keys' : issue}`)}
          </Text>
          {disabledKeys && onEnableKeys ? (
            <Button disabled={isSaving} onPress={onEnableKeys} variant="secondary">
              {t('settings.provider.setup.enableKeys')}
            </Button>
          ) : null}
        </View>
      ) : null}
      <ProviderForm value={form}>
        <ProviderForm.Avatar>{avatar}</ProviderForm.Avatar>
        <ProviderForm.Name />
        {endpointMode === 'custom-text' ? (
          <>
            {showApiKey ? <ProviderForm.ApiKey autoFocus={issue === 'missing-api-key'} /> : null}
            <ProviderForm.Endpoints />
          </>
        ) : (
          <>
            <ProviderForm.BaseUrl />
            {showApiKey ? <ProviderForm.ApiKey autoFocus={issue === 'missing-api-key'} /> : null}
          </>
        )}
      </ProviderForm>
      <View className="px-4 pb-8">
        <Button disabled={!canSave} loading={isSaving} onPress={onSave} size="lg">
          {t(isSaving ? 'settings.provider.setup.preparing' : 'settings.provider.setup.next')}
        </Button>
      </View>
    </KeyboardAwareScrollView>
  );
}
