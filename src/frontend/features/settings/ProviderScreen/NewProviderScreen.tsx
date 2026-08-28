import { useAlert } from '@cherrystudio/ui/components';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
import { useMutation } from '@/frontend/data';
import { keyboardBottomOffset } from '@/frontend/utils/constants';
import type { ApiKeyEntry } from '@/shared/data/types/provider';

import { useProviderAvatarActions } from '../components/providerAvatarStore';
import {
  buildCustomProviderCreationPayload,
  findInvalidCustomProviderEndpointUrl,
} from './apiService/utils/providerApiServiceEndpointRules';
import {
  createEmptyProviderFormValues,
  NEW_PROVIDER_ENDPOINT_TYPES,
  ProviderForm,
  type ProviderFormValues,
  useProviderFormDraft,
} from './providerForm';

export default function NewProviderScreen() {
  const { t } = useTranslation();
  const router = useRouter();
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
      const trimmedApiKey = values.apiKey.trim();
      const { defaultChatEndpoint, endpointConfigs } = buildCustomProviderCreationPayload({
        endpointUrls: values.endpointUrls,
        preferredChatEndpoint: values.defaultChatEndpoint,
      });

      const apiKeys: ApiKeyEntry[] | undefined = trimmedApiKey
        ? [{ id: Crypto.randomUUID(), isEnabled: true, key: trimmedApiKey }]
        : undefined;

      await createProvider({
        body: {
          apiKeys,
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

      // Providers are created disabled; the user asked for new custom providers to
      // land already enabled, so flip it on before navigating to the detail page.
      await enableProvider({
        body: { isEnabled: true },
        params: { id: providerId },
      });

      return providerId;
    },
    [createProvider, enableProvider, providerAvatars],
  );

  // A provider with no URL cannot reach anything, so creating one demands a Base
  // URL on top of the form's own rule. Editing does not: an existing provider is
  // allowed to have none, and blocking the button would trap a rename.
  const canSubmit = meta.canSubmit && baseUrl.trim().length > 0;
  const handleFinish = useCallback(() => {
    if (!canSubmit) {
      return;
    }

    if (findInvalidCustomProviderEndpointUrl(state.endpointUrls)) {
      alert.show({
        description: t('settings.provider.apiService.invalidBaseUrlMessage'),
        title: t('settings.provider.apiService.invalidBaseUrlTitle'),
      });
      return;
    }

    Keyboard.dismiss();

    const trimmedName = state.name.trim();
    void submitProvider(state)
      .then((providerId) => {
        router.replace({
          params: {
            providerId,
            providerName: trimmedName,
            returnToConfiguration: 'true',
          },
          pathname: '/settings/provider/[providerId]/model-pull',
        });
      })
      .catch(() => {
        alert.show({ title: t('settings.provider.add.error') });
      });
  }, [alert, canSubmit, router, state, submitProvider, t]);

  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.save'),
        disabled: !canSubmit,
        key: 'finish-new-provider',
        label: t('common.save'),
        onPress: handleFinish,
        type: 'label',
      },
    ],
    [canSubmit, handleFinish, t],
  );

  return (
    <>
      <RouteHeader rightActions={rightActions} title={t('settings.provider.add.title')} />
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
      </KeyboardAwareScrollView>
    </>
  );
}
