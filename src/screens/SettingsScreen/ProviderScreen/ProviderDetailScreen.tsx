import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { SquareArrowOutUpRightIcon } from 'lucide-uniwind/png';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { BackHeader, type HeaderToolbarAction } from '@/components/headers';
import {
  canEditProviderEndpoint,
  shouldShowApiKeys,
  useProviderApiServiceDraft,
  useProviderApiServiceQueries,
} from '@/screens/SettingsScreen/ProviderScreen/apiService';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { ProviderApiManagementSection } from './components/ProviderApiManagementSection';
import { ProviderModelList } from './components/ProviderModelList';
import { useProviderDetailSettings } from './detail';
import { ProviderModelCheckSheet, useProviderModelCheck, useProviderModelPull } from './models';
import { stashProviderModelPullPreview } from './models/utils/providerModelPullPreviewStore';

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
  const { apiKeys, apiKeysQuery, authConfig, authConfigQuery } = useProviderApiServiceQueries(
    providerId ?? '',
  );
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
  const { isPreviewLoading: isModelPullLoading, loadPullPreview } = useProviderModelPull({
    onPreviewReady: (preview) => {
      if (!providerId) {
        return;
      }

      stashProviderModelPullPreview(providerId, preview);
    },
    provider,
    providerId: providerId ?? '',
  });
  const { draft, primaryBaseUrl } = useProviderApiServiceDraft({
    apiKeys,
    authConfig,
    provider,
  });
  const canEditEndpoint = canEditProviderEndpoint(provider);
  const showApiKeys = draft ? shouldShowApiKeys(draft.authDraft.type) : false;
  const isApiDraftLoading = apiKeysQuery.isPending || authConfigQuery.isPending || !draft;
  const officialWebsite = provider?.websites?.official;
  const openOfficialWebsite = useCallback(() => {
    if (!officialWebsite) {
      return;
    }

    void openExternalUrl(officialWebsite);
  }, [officialWebsite]);
  const rightActions = useMemo<HeaderToolbarAction[]>(
    () =>
      officialWebsite
        ? [
            {
              accessibilityLabel: t('common.officialWebsite'),
              androidIcon: SquareArrowOutUpRightIcon,
              icon: 'arrow.up.right.square',
              key: 'official-website',
              onPress: openOfficialWebsite,
            },
          ]
        : [],
    [officialWebsite, openOfficialWebsite, t],
  );
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
  const openModelPullSettings = async () => {
    if (!providerId) {
      return;
    }

    const result = await loadPullPreview();
    if (result !== 'ready') {
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
      <BackHeader
        rightActions={rightActions}
        title={providerName ?? t('settings.pages.provider.title')}
      />
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
        isPullDisabled={!provider || isModelPullLoading}
        isPullLoading={isModelPullLoading}
        models={models}
        provider={provider}
        onAddPress={openModelAddSettings}
        onCheckPress={openCheckSheet}
        onPullPress={() => void openModelPullSettings()}
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
