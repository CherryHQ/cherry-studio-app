import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';

import { BackHeader } from '@/components/headers';
import {
  buildApiKeyEntriesFromInput,
  canEditProviderEndpoint,
  shouldShowApiKeys,
  useProviderApiServiceDraft,
  useProviderApiServiceQueries,
} from '@/screens/SettingsScreen/ProviderScreen/apiService';
import { ProviderApiManagementSection } from './components/ProviderApiManagementSection';
import { ProviderModelList } from './components/ProviderModelList';
import { useProviderDetailSettings } from './detail';
import { ProviderModelCheckSheet, useProviderModelCheck } from './models';

export default function ProviderDetailSettingsScreen() {
  const { providerId, providerName } = useLocalSearchParams<{
    providerId?: string;
    providerName?: string;
  }>();
  const { t } = useTranslation();
  const router = useRouter();
  const [apiKeysVisible, setApiKeysVisible] = useState(false);
  const { models, modelsQuery, provider, providerQuery, updateProviderEnabledMutation } =
    useProviderDetailSettings(providerId ?? '');
  const { apiKeys, apiKeysQuery, authConfig, authConfigQuery, replaceApiKeysMutation } =
    useProviderApiServiceQueries(providerId ?? '');
  const {
    apiKeyOptions: checkApiKeyOptions,
    closeSheet: closeCheckSheet,
    isChecking: isModelChecking,
    isSheetOpen: isCheckSheetOpen,
    openCheckSheet,
    selectedApiKeyId: selectedCheckApiKeyId,
    selectedModelId: selectedCheckModelId,
    setSelectedApiKeyId: setSelectedCheckApiKeyId,
    setSelectedModelId: setSelectedCheckModelId,
    startCheck: startModelCheck,
  } = useProviderModelCheck({
    apiKeys,
    models,
    provider,
    providerId: providerId ?? '',
  });
  const { draft, primaryBaseUrl, syncApiKeysDraft, updateApiKeysInput } =
    useProviderApiServiceDraft({
      apiKeys,
      authConfig,
      provider,
    });
  const commitApiKeysInput = useCallback(
    async (value: string) => {
      if (!providerId || !draft) {
        return;
      }

      const nextApiKeys = buildApiKeyEntriesFromInput(value, draft.apiKeyEntries);
      updateApiKeysInput(value);

      try {
        await replaceApiKeysMutation.mutateAsync(nextApiKeys);
        syncApiKeysDraft(providerId, nextApiKeys);
      } catch {
        Alert.alert(t('settings.provider.apiService.saveFailed'));
      }
    },
    [draft, providerId, replaceApiKeysMutation, syncApiKeysDraft, t, updateApiKeysInput],
  );
  const canEditEndpoint = canEditProviderEndpoint(provider);
  const showApiKeys = draft ? shouldShowApiKeys(draft.authDraft.type) : false;
  const isApiDraftLoading = apiKeysQuery.isPending || authConfigQuery.isPending || !draft;
  const openEndpointSettings = () => {
    if (!providerId) {
      return;
    }

    router.push({
      params: {
        ...(provider?.name ? { providerName: provider.name } : {}),
        providerId,
      },
      pathname: '/settings/provider/[providerId]/endpoint-settings',
    });
  };
  const openApiKeySettings = () => {
    if (!providerId) {
      return;
    }

    router.push({
      params: {
        ...(provider?.name ? { providerName: provider.name } : {}),
        providerId,
      },
      pathname: '/settings/provider/[providerId]/api-key-settings',
    });
  };
  const openModelAddSettings = () => {
    if (!providerId) {
      return;
    }

    router.push({
      params: {
        ...(provider?.name ? { providerName: provider.name } : {}),
        providerId,
      },
      pathname: '/settings/provider/[providerId]/model-add',
    });
  };
  const openModelPullSettings = () => {
    if (!providerId) {
      return;
    }

    router.push({
      params: {
        ...(provider?.name ? { providerName: provider.name } : {}),
        providerId,
      },
      pathname: '/settings/provider/[providerId]/model-pull',
    });
  };

  if (!providerId || providerQuery.isError) {
    return <Redirect href="/settings/provider" />;
  }

  return (
    <>
      <BackHeader title={providerName ?? t('settings.pages.provider.title')} />
      <ProviderModelList
        header={
          <View>
            <ProviderApiManagementSection
              apiKeysInput={draft?.apiKeysInput}
              apiKeysVisible={apiKeysVisible}
              baseUrl={primaryBaseUrl}
              isUpdatingEnabled={updateProviderEnabledMutation.isPending}
              provider={provider}
              showApiKeys={!isApiDraftLoading && showApiKeys}
              showBaseUrl={!isApiDraftLoading && canEditEndpoint}
              onApiKeysInputChange={commitApiKeysInput}
              onApiKeysManagePress={openApiKeySettings}
              onApiKeysVisibleToggle={() => setApiKeysVisible((visible) => !visible)}
              onBaseUrlManagePress={openEndpointSettings}
              onEnabledChange={(enabled) => updateProviderEnabledMutation.mutate(enabled)}
            />
          </View>
        }
        isAddDisabled={!provider}
        isAddLoading={false}
        isLoading={modelsQuery.isPending}
        isCheckDisabled={models.length === 0}
        isCheckLoading={isModelChecking}
        isPullDisabled={!provider}
        isPullLoading={false}
        models={models}
        provider={provider}
        onAddPress={openModelAddSettings}
        onCheckPress={openCheckSheet}
        onPullPress={openModelPullSettings}
      />
      <ProviderModelCheckSheet
        apiKeyOptions={checkApiKeyOptions}
        isChecking={isModelChecking}
        isOpen={isCheckSheetOpen}
        models={models}
        selectedApiKeyId={selectedCheckApiKeyId}
        selectedModelId={selectedCheckModelId}
        onApiKeyChange={setSelectedCheckApiKeyId}
        onClose={closeCheckSheet}
        onModelChange={setSelectedCheckModelId}
        onStart={startModelCheck}
      />
    </>
  );
}
