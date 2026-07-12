import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { Trash2Icon, SquareArrowOutUpRightIcon } from 'lucide-uniwind/png';

import { BackHeader } from '@/components/headers';
import type { HeaderToolbarAction } from '@/components/headers/BackHeader/BackHeader.types';
import { queryKeys } from '@/data/api';
import { useDataMutation } from '@/data/hooks';
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
import { useSettingsConfirmDialog } from '@/screens/SettingsScreen/hooks/useSettingsConfirmDialog';
import { useToast } from 'heroui-native/toast';
import {
  ProviderModelAddSheet,
  ProviderModelCheckSheet,
  ProviderModelPullSheet,
  useProviderModelAdd,
  useProviderModelCheck,
  useProviderModelPull,
} from './models';
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
  const { confirmDialog, requestConfirm } = useSettingsConfirmDialog();
  const { toast } = useToast();
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
  const { mutateAsync: deleteProvider } = useDataMutation({
    invalidateQueries: [
      queryKeys.providers.list(),
      queryKeys.providers.list({ enabled: true }),
      queryKeys.providers.list({ enabled: false }),
      ...(providerId ? [queryKeys.providers.detail(providerId)] : []),
    ],
    mutationFn: (services) => {
      if (!providerId) {
        throw new Error('providerId is required');
      }

      return services.provider.delete(providerId);
    },
  });
  const isCustomProvider = provider && !provider.presetProviderId;
  const handleDelete = useCallback(() => {
    if (!provider) {
      return;
    }

    requestConfirm({
      title: t('settings.provider.delete.title'),
      message: t('settings.provider.delete.message', { name: provider.name }),
      onConfirm: () => {
        void deleteProvider()
          .then(() => router.back())
          .catch(() => {
            toast.show({
              label: t('settings.provider.delete.error'),
              variant: 'danger',
            });
          });
      },
    });
  }, [deleteProvider, provider, requestConfirm, router, t, toast]);
  const rightActions = useMemo<HeaderToolbarAction[]>(
    () =>
      isCustomProvider
        ? [
            {
              accessibilityLabel: t('settings.provider.delete.title'),
              androidIcon: Trash2Icon,
              icon: 'trash',
              key: 'delete-provider',
              onPress: handleDelete,
            },
          ]
        : [],
    [handleDelete, isCustomProvider, t],
  );
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
      {confirmDialog}
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
