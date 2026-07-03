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
import {
  ProviderModelAddSheet,
  ProviderModelCheckSheet,
  ProviderModelPullSheet,
  useProviderModelAdd,
  useProviderModelCheck,
  useProviderModelPull,
} from './models';

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
  const {
    applyPullPreview,
    closeSheet: closePullSheet,
    isApplying: isApplyingPull,
    isBusy: isPullBusy,
    isPreviewLoading: isPullPreviewLoading,
    isSheetOpen: isPullSheetOpen,
    openPullPreview,
    preview: pullPreview,
  } = useProviderModelPull({ provider, providerId: providerId ?? '' });
  const {
    canSubmit: canSubmitAddModel,
    closeSheet: closeAddSheet,
    endpointTypeError: addModelEndpointTypeError,
    formState: addModelFormState,
    isSheetOpen: isAddSheetOpen,
    isSubmitting: isAddModelSubmitting,
    modelIdError: addModelIdError,
    openSheet: openAddSheet,
    showEndpointTypes: showAddModelEndpointTypes,
    submitAddModel,
    updateContextWindow: updateAddModelContextWindow,
    updateEndpointTypes: updateAddModelEndpointTypes,
    updateGroup: updateAddModelGroup,
    updateMaxInputTokens: updateAddModelMaxInputTokens,
    updateMaxOutputTokens: updateAddModelMaxOutputTokens,
    updateModelId: updateAddModelId,
    updateName: updateAddModelName,
  } = useProviderModelAdd({ provider, providerId: providerId ?? '' });
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
        isAddDisabled={!provider || isAddModelSubmitting}
        isAddLoading={isAddModelSubmitting}
        isLoading={modelsQuery.isPending}
        isCheckDisabled={models.length === 0}
        isCheckLoading={isModelChecking}
        isPullDisabled={!provider || isPullBusy}
        isPullLoading={isPullPreviewLoading}
        models={models}
        provider={provider}
        onAddPress={openAddSheet}
        onCheckPress={openCheckSheet}
        onPullPress={openPullPreview}
      />
      <ProviderModelAddSheet
        canSubmit={canSubmitAddModel}
        endpointTypeError={addModelEndpointTypeError}
        formState={addModelFormState}
        isOpen={isAddSheetOpen}
        isSubmitting={isAddModelSubmitting}
        modelIdError={addModelIdError}
        showEndpointTypes={showAddModelEndpointTypes}
        onClose={closeAddSheet}
        onContextWindowChange={updateAddModelContextWindow}
        onEndpointTypesChange={updateAddModelEndpointTypes}
        onGroupChange={updateAddModelGroup}
        onMaxInputTokensChange={updateAddModelMaxInputTokens}
        onMaxOutputTokensChange={updateAddModelMaxOutputTokens}
        onModelIdChange={updateAddModelId}
        onNameChange={updateAddModelName}
        onSubmit={submitAddModel}
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
      <ProviderModelPullSheet
        isApplying={isApplyingPull}
        isOpen={isPullSheetOpen}
        preview={pullPreview}
        provider={provider}
        onApply={applyPullPreview}
        onClose={closePullSheet}
      />
    </>
  );
}
