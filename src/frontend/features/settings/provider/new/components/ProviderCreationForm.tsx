import { Button, useAlert, useToast } from '@cherrystudio/ui/components';
import * as Crypto from 'expo-crypto';
import { type ReactElement, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { useMutation } from '@/frontend/data';
import { keyboardBottomOffset } from '@/frontend/utils/constants';
import type { ProviderConfigurationIssue } from '@/shared/contracts';

import { buildApiKeyEntriesFromInput } from '../../apiService';
import {
  buildCustomProviderCreationPayload,
  findInvalidCustomProviderEndpointUrl,
  hasConfiguredCustomProviderTextEndpoint,
} from '../../apiService/utils/providerApiServiceEndpointRules';
import {
  createEmptyProviderFormValues,
  NEW_PROVIDER_ENDPOINT_TYPES,
  ProviderForm,
  type ProviderFormValue,
  type ProviderFormValues,
  useProviderFormDraft,
} from '../../components/ProviderForm';
import { useProviderAvatarActions } from '../../hooks/useProviderAvatar';

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
