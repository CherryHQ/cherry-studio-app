import { Button, useAlert } from '@cherrystudio/ui/components';
import * as Crypto from 'expo-crypto';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { useMutation } from '@/frontend/data';
import { keyboardBottomOffset } from '@/frontend/utils/constants';

import { useProviderAvatarActions } from '../components/providerAvatarStore';
import { buildApiKeyEntriesFromInput } from './apiService/utils/providerApiServiceApiKeys';
import {
  buildCustomProviderCreationPayload,
  findInvalidCustomProviderEndpointUrl,
} from './apiService/utils/providerApiServiceEndpointRules';
import {
  createEmptyProviderFormValues,
  NEW_PROVIDER_ENDPOINT_TYPES,
  ProviderForm,
  type ProviderFormValue,
  type ProviderFormValues,
  useProviderFormDraft,
} from './providerForm';

export function useNewProviderForm() {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const providerAvatars = useProviderAvatarActions();
  const createProviderMutation = useMutation('POST', '/providers', {
    refresh: ['/providers', '/providers/page'],
  });
  const enableProviderMutation = useMutation('PATCH', '/providers/:id', {
    refresh: ['/providers', '/providers/page'],
  });
  const createProvider = createProviderMutation.trigger;
  const enableProvider = enableProviderMutation.trigger;
  const isCreating = createProviderMutation.isLoading || enableProviderMutation.isLoading;
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

      await enableProvider({
        body: { isEnabled: true },
        params: { id: providerId },
      });

      return providerId;
    },
    [createProvider, enableProvider, providerAvatars],
  );
  const canSubmit = meta.canSubmit && baseUrl.trim().length > 0;
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

export function ProviderNewFormContent({
  canSave,
  form,
  isSaving,
  onSave,
}: {
  canSave: boolean;
  form: ProviderFormValue;
  isSaving: boolean;
  onSave: () => void;
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
        <ProviderForm.Avatar />
        <ProviderForm.Name />
        <ProviderForm.BaseUrl />
        <ProviderForm.ApiKey />
      </ProviderForm>
      <View className="px-4 pb-8">
        <Button disabled={!canSave} loading={isSaving} onPress={onSave} size="lg">
          {isSaving ? t('common.saving') : t('common.save')}
        </Button>
      </View>
    </KeyboardAwareScrollView>
  );
}
